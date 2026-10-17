import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.js";
test("separate passwords and durable hashed sessions survive restart; disable and reset revoke sessions", () => {
  const path = mkdtempSync(join(tmpdir(), "mb-accounts-"));
  let store = new Store(path);
  try {
    const husband = store.createUser("husband", "Husband", "husband-password-123"),
      wife = store.createUser("wife", "Wife", "wife-password-12345", husband);
    assert.equal(store.verifyUser("WIFE", "wife-password-12345")?.id, wife.id);
    assert.equal(store.verifyUser("wife", "husband-password-123"), undefined);
    store.createSession("raw-session-token", wife, Date.now() + 86400000);
    store.close();
    store = new Store(path);
    assert.equal(store.sessionUser("raw-session-token")?.id, wife.id);
    const raw = JSON.stringify(store.db.prepare("SELECT * FROM users").all());
    assert.ok(!raw.includes("wife-password-12345"));
    assert.ok(
      !JSON.stringify(store.db.prepare("SELECT * FROM sessions").all()).includes(
        "raw-session-token",
      ),
    );
    store.updateUser(wife.id, { enabled: false }, husband);
    assert.equal(store.sessionUser("raw-session-token"), undefined);
    assert.equal(store.verifyUser("wife", "wife-password-12345"), undefined);
    store.updateUser(wife.id, { enabled: true }, husband);
    store.createSession("new-session", wife, Date.now() + 86400000);
    store.updateUser(wife.id, { password: "a-new-wife-password-123" }, husband);
    assert.equal(store.sessionUser("new-session"), undefined);
    assert.equal(store.verifyUser("wife", "wife-password-12345"), undefined);
    assert.equal(store.verifyUser("wife", "a-new-wife-password-123")?.id, wife.id);
    assert.throws(
      () =>
        store.updateUser(husband.id, { password: "new-husband-password-123" }, husband),
      /current password/,
    );
    assert.throws(
      () => store.updateUser(husband.id, { enabled: false }, husband),
      /cannot disable/,
    );
    assert.throws(
      () => store.createUser("wife", "Duplicate", "duplicate-password-123"),
      /taken/,
    );
    const logs = JSON.stringify(store.activity());
    assert.ok(!logs.includes("wife-password"));
    assert.ok(!logs.includes("raw-session-token"));
    assert.match(logs, /passwordChanged/);
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("message archive retains more than 100 notes, exact senders, pagination and search escaping", () => {
  const path = mkdtempSync(join(tmpdir(), "mb-archive-")),
    store = new Store(path);
  try {
    const actor = store.createUser("wife", "Her name", "wife-password-12345");
    for (let i = 0; i < 130; i++)
      store.enqueue(
        i === 0 ? "100% love_ forever" : `Note ${i}`,
        5,
        1000 + i * 6000,
        actor,
      );
    const first = store.history();
    assert.equal(first.items.length, 50);
    assert.ok(first.nextCursor);
    const second = store.history(first.nextCursor!);
    assert.equal(second.items.length, 50);
    const third = store.history(second.nextCursor!);
    assert.equal(third.items.length, 30);
    assert.equal(third.nextCursor, null);
    assert.equal(
      new Set([...first.items, ...second.items, ...third.items].map((m) => m.id)).size,
      130,
    );
    const original = store.history(undefined, "100% love_");
    assert.equal(original.items.length, 1);
    assert.equal(original.items[0].authorName, "Her name");
    assert.equal(original.items[0].authorId, actor.id);
    assert.equal(store.history(undefined, "%").items.length, 1);
    assert.equal(store.history(undefined, "_").items.length, 1);
    store.updateUser(actor.id, { name: "New name" }, actor);
    assert.equal(store.history(undefined, "100% love_").items[0].authorName, "Her name");
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM messages").get()!.n, 130);
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("settings edits use a revision so two partners cannot overwrite each other silently", () => {
  const path = mkdtempSync(join(tmpdir(), "mb-revision-")),
    store = new Store(path);
  try {
    const user = store.createUser("husband", "Husband", "husband-password-123");
    const settings = store.settings(),
      revision = store.revision();
    store.saveSettings({ ...settings, backlight: false }, user, revision);
    assert.throws(
      () => store.saveSettings({ ...settings, timezone: "UTC" }, user, revision),
      /another device/,
    );
    assert.equal(store.settings().backlight, false);
    assert.equal(store.settings().timezone, settings.timezone);
    assert.equal(store.revision(), revision + 1);
    assert.ok(store.activity().items.some((a) => a.action === "settings.updated"));
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});

test("existing single-user data upgrades without losing notes or changing its calendar", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const path = mkdtempSync(join(tmpdir(), "mb-migration-"));
  const old = new DatabaseSync(join(path, "mystery-box.sqlite"));
  old.exec(
    `CREATE TABLE settings(id INTEGER PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE messages(id TEXT PRIMARY KEY,text TEXT NOT NULL,startsAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL,cancelled INTEGER NOT NULL DEFAULT 0);`,
  );
  old.prepare("INSERT INTO settings VALUES(1,?)").run(
    JSON.stringify({
      timezone: "UTC",
      calendar: "gregory",
      dateOrder: "dmy",
      hour12: true,
      showSeconds: true,
      backlight: true,
      matrix: { mode: "off", text: "", speed: 5, frames: ["000000000000000000000000"] },
    }),
  );
  old
    .prepare("INSERT INTO messages VALUES(?,?,?,?,?,0)")
    .run("old-note", "A memory from before", 1000, 6000, 1000);
  old.close();
  const store = new Store(path);
  try {
    assert.equal(store.settings().calendar, "gregory");
    assert.equal(store.settings().displayMode, "clock");
    assert.equal(store.settings().love.startAt, null);
    assert.equal(store.history().items[0].text, "A memory from before");
    assert.equal(store.history().items[0].authorName, "Before accounts");
    assert.equal(store.revision(), 0);
    assert.equal(store.users().length, 0);
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
