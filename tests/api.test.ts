import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { defaults, type Snapshot } from "../shared/model.js";
import { render } from "../server/render.js";
import { readConfig } from "../server/config.js";
test("authenticated API validates changes, rejects cross origin and serves SSE", async () => {
  const path = mkdtempSync(join(tmpdir(), "mb-api-")),
    store = new Store(path);
  const config = readConfig({
    ADMIN_PASSWORD: "test-password-12345",
    MQTT_PASSWORD: "mqtt-password-12345",
    APP_ORIGIN: "http://localhost:5173",
  });
  const runtime = {
    snapshot: (): Snapshot => ({
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
      deviceId: "uno-r4",
    }),
    changed: () => {},
    listen: (_fn: () => void) => () => {},
  };
  const server = createApp(config, store, runtime).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const req = (path: string, options: RequestInit = {}) => fetch(base + path, options);
  const post = (body: unknown, headers = {}) => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  try {
    assert.equal((await req("/healthz")).status, 200);
    assert.equal((await req("/api/state")).status, 401);
    assert.equal(
      (
        await req(
          "/api/login",
          post({ password: config.ADMIN_PASSWORD }, { Origin: "https://evil.example" }),
        )
      ).status,
      403,
    );
    assert.equal((await req("/api/login", post({ password: "bad" }))).status, 401);
    const login = await req("/api/login", post({ password: config.ADMIN_PASSWORD }));
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const headers = { Cookie: cookie, "Content-Type": "application/json" };
    assert.equal((await req("/api/state", { headers })).status, 200);
    assert.equal(
      (
        await req("/api/settings", {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...defaults, timezone: "wrong" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await req("/api/settings", {
          method: "PUT",
          headers,
          body: JSON.stringify({ ...defaults, backlight: false }),
        })
      ).status,
      200,
    );
    assert.equal(store.settings().backlight, false);
    assert.equal(
      (
        await req(
          "/api/messages",
          post({ text: "سلام", duration: 15 }, { Cookie: cookie }),
        )
      ).status,
      400,
    );
    const message = await req(
      "/api/messages",
      post({ text: "Hello LCD", duration: 15 }, { Cookie: cookie }),
    );
    assert.equal(message.status, 201);
    const { id } = await message.json();
    assert.equal(
      (await req("/api/messages/" + id, { method: "DELETE", headers })).status,
      200,
    );
    const abort = new AbortController();
    const stream = await req("/api/events", { headers, signal: abort.signal });
    assert.match(stream.headers.get("content-type")!, /^text\/event-stream/);
    const { value } = await stream.body!.getReader().read();
    assert.match(new TextDecoder().decode(value), /^data: /);
    abort.abort();
    assert.equal((await req("/api/logout", { method: "POST", headers })).status, 200);
    assert.equal((await req("/api/state", { headers })).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
test("production rejects insecure deployment config", () => {
  assert.throws(
    () =>
      readConfig({
        ADMIN_PASSWORD: "test-password-12345",
        MQTT_PASSWORD: "mqtt-password-12345",
        NODE_ENV: "production",
      }),
    /HTTPS/,
  );
});
