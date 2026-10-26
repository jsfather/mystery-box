import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.js";
import { defaults, settingsSchema } from "../shared/model.js";
import { render } from "../server/render.js";
import { createApp } from "../server/app.js";
import { readConfig } from "../server/config.js";

test("alert defaults migrate safely and message identity stays stable across scroll frames", () => {
  const legacy = structuredClone(defaults) as any;
  delete legacy.messaging.blink;
  assert.equal(settingsSchema.parse(legacy).messaging.blink, false);
  const now = Date.parse("2026-10-26T12:00:00Z");
  const settings = structuredClone(defaults);
  settings.messaging.blink = true;
  const message = {
    id: "3779734a-aac0-4bcf-bcc9-e599309e09a0",
    text: "A little hello",
    startsAt: now,
    expiresAt: now + 5000,
    createdAt: now,
    cancelled: false,
  };
  const first = render(settings, [message], now),
    later = render(settings, [message], now + 1000);
  assert.equal(first.notify, true);
  assert.equal(first.messageId, message.id);
  assert.equal(first.messageAge, 0);
  assert.equal(later.messageId, first.messageId);
  assert.equal(later.messageAge, 1000);
  assert.equal(
    render(settings, [{ ...message, startsAt: now + 1000 }], now).messageId,
    "",
  );
  assert.equal(render(settings, [{ ...message, cancelled: true }], now).messageId, "");
  assert.equal(render(settings, [message], now + 5000).messageId, "");
  assert.ok(Buffer.byteLength(JSON.stringify(first)) <= 768);
  assert.ok(
    Buffer.byteLength(
      JSON.stringify(render(settings, [{ ...message, text: '"'.repeat(160) }], now)),
    ) <= 1280,
  );
});

test("device alert flashes six times without blocking, ignores duplicates and old messages, and survives rollover", () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-alert-"));
  try {
    writeFileSync(
      join(dir, "test.cpp"),
      `
#include <cassert>
#include "message_alert.h"
int main() {
  MessageAlert alert;
  alert.accept("disabled", false, 0, 0); assert(!alert.active);
  alert.accept("disabled", true, 1000, 1000); assert(!alert.active);
  alert.accept("old", true, 4000, 1000); assert(!alert.active);
  alert.accept("new", true, 0, 2000);
  int flashes = 0;
  for (uint32_t t = 0; t < 3000; t += 250) {
    assert(alert.update(2000+t));
    if (alert.bright(2000+t)) ++flashes;
    alert.accept("new", true, t, 2000+t); // Refreshes cannot extend the alert.
  }
  assert(flashes == 6); assert(!alert.update(5000));
  alert.accept("new", true, 0, 6000); assert(!alert.active);
  alert.accept("next", true, 0, 6000); assert(alert.active);
  alert.accept("next", false, 100, 6100); assert(!alert.active);
  alert.accept("rollover", true, 0, 0xfffffff0UL);
  assert(alert.update(234) && !alert.bright(234));
  assert(!alert.update(2984));
  alert.accept("cancel", true, 0, 4000); alert.cancel(); assert(!alert.update(4100));
}`,
    );
    execFileSync("c++", [
      "-std=c++11",
      "-I",
      resolve("firmware/mystery_box"),
      join(dir, "test.cpp"),
      "-o",
      join(dir, "test"),
    ]);
    execFileSync(join(dir, "test"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("batch deletion removes active and archived messages atomically and persists across restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-delete-"));
  let store = new Store(dir);
  try {
    const user = store.createUser("tester", "Tester", "test-only-password-1234");
    const archived = store.enqueue("An old note", 5, 0, user);
    const active = store.enqueue("An active note", 120, Date.now(), user);
    const kept = store.enqueue("A kept note", 120, Date.now(), user);
    const before = store.historyRevision();
    store.db.exec(
      `CREATE TRIGGER fail_delete BEFORE DELETE ON messages WHEN OLD.id='${active.id}' BEGIN SELECT RAISE(ABORT,'test rollback'); END;`,
    );
    assert.throws(() => store.deleteMessages([archived.id, active.id], user));
    assert.ok(store.message(archived.id));
    assert.ok(store.message(active.id));
    assert.equal(store.historyRevision(), before);
    store.db.exec("DROP TRIGGER fail_delete");
    const result = store.deleteMessages([archived.id, active.id], user);
    assert.deepEqual(new Set(result.deletedIds), new Set([archived.id, active.id]));
    assert.equal(result.revision, before + 1);
    assert.equal(store.message(archived.id), undefined);
    assert.equal(store.message(active.id), undefined);
    assert.ok(store.message(kept.id));
    assert.equal(store.history().items.length, 1);
    assert.deepEqual(
      store.lookupMessages([archived.id, kept.id]).map((message) => message.id),
      [kept.id],
    );
    assert.equal(store.deleteMessages([archived.id], user).deletedIds.length, 0);
    assert.equal(store.historyRevision(), before + 1);
    const entry = store
      .activity()
      .items.find((item) => item.action === "message.deleted")!;
    assert.deepEqual(entry.details, { count: 2 });
    store.close();
    store = new Store(dir);
    assert.equal(store.message(active.id), undefined);
    assert.equal(store.historyRevision(), before + 1);
    store.factoryReset(user, true);
    assert.equal(store.historyRevision(), before + 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("delete and lookup APIs enforce auth, origin, bounds and keep cancellation separate", async () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-delete-api-")),
    store = new Store(dir);
  const config = readConfig({
    ADMIN_PASSWORD: "test-only-password-1234",
    MQTT_PASSWORD: "test-only-mqtt-password",
    APP_ORIGIN: "http://localhost:5173",
  });
  let changes = 0;
  const app = createApp(config, store, {
    snapshot: () => ({
      settings: store.settings(),
      frame: render(store.settings(), store.messages()),
      device: {
        online: false,
        lastSeen: null,
        rssi: null,
        ip: null,
        firmware: null,
        seq: null,
      },
      broker: false,
      messages: store.messages(),
      serverTime: Date.now(),
      deviceId: "test",
      settingsRevision: 0,
      resetRevision: 0,
      historyRevision: store.historyRevision(),
    }),
    changed: () => {
      ++changes;
    },
    listen: () => () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/`;
  let cookie = "";
  const post = (path: string, value: unknown, origin = "http://localhost:5173") =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
      body: JSON.stringify(value),
    });
  try {
    assert.equal((await post("messages/delete", { ids: [] })).status, 401);
    assert.equal((await post("messages/lookup", { ids: [] })).status, 401);
    const login = await post("login", {
      username: "husband",
      password: config.ADMIN_PASSWORD,
    });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    store.db
      .prepare(
        "INSERT INTO messages(id,text,startsAt,expiresAt,createdAt,cancelled) VALUES(?,?,?,?,?,?)",
      )
      .run("legacy-note", "An older note", 0, 1, 0, 1);
    const first = await (await post("messages", { text: "Delete one" })).json();
    const second = await (await post("messages", { text: "Keep this" })).json();
    assert.equal(
      (await post("messages/delete", { ids: [first.id] }, "https://other.example"))
        .status,
      403,
    );
    for (const body of [
      { ids: [] },
      { ids: [first.id, first.id] },
      { ids: ["invalid/id"] },
      { ids: Array(101).fill(first.id) },
      { ids: [first.id], all: true },
    ])
      assert.equal((await post("messages/delete", body)).status, 400);
    assert.equal((await post(`messages/${second.id}/cancel`, {})).status, 200);
    assert.equal(store.message(second.id)!.cancelled, true);
    assert.equal(
      (await (await post("messages/lookup", { ids: [first.id, second.id] })).json()).items
        .length,
      2,
    );
    const before = changes;
    assert.deepEqual(
      (await (await post("messages/delete", { ids: [first.id] })).json()).deletedIds,
      [first.id],
    );
    assert.equal(changes, before + 1);
    assert.equal(store.message(first.id), undefined);
    assert.ok(store.message(second.id));
    assert.equal(
      (await (await post("messages/lookup", { ids: [first.id] })).json()).items.length,
      0,
    );
    assert.equal(
      (await (await fetch(base + "state", { headers: { Cookie: cookie } })).json())
        .historyRevision,
      1,
    );
    assert.deepEqual(
      (await (await post("messages/delete", { ids: ["legacy-note"] })).json()).deletedIds,
      ["legacy-note"],
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
