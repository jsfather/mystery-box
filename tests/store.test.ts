import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
test("settings and queued message windows survive restarts; cancellation persists", () => {
  const path = mkdtempSync(join(tmpdir(), "mb-store-"));
  let store = new Store(path);
  try {
    const settings = { ...store.settings(), timezone: "Europe/London" };
    store.saveSettings(settings);
    const a = store.enqueue("First", 5, 1000),
      b = store.enqueue("Second", 10, 1000);
    assert.equal(b.startsAt, a.expiresAt);
    store.cancel(a.id);
    store.close();
    store = new Store(path);
    assert.equal(store.settings().timezone, "Europe/London");
    assert.equal(store.messages()[0].cancelled, true);
    assert.equal(store.messages()[1].expiresAt, 16000);
    assert.equal(store.cancel("not-an-id"), false);
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("queue is bounded and expired messages free capacity", () => {
  const path = mkdtempSync(join(tmpdir(), "mb-queue-"));
  const store = new Store(path);
  try {
    for (let i = 0; i < 20; i++) store.enqueue("test", 5, 1000);
    assert.throws(() => store.enqueue("full", 5, 1000), /Queue is full/);
    assert.doesNotThrow(() => store.enqueue("new", 5, 200000));
  } finally {
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
