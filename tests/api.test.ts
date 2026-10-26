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
      settingsRevision: store.revision(),
      resetRevision: store.resetRevision(),
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
          post(
            { username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD },
            { Origin: "https://evil.example" },
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/api/login",
          post({ username: config.ADMIN_USERNAME, password: "bad" }),
        )
      ).status,
      401,
    );
    const login = await req(
      "/api/login",
      post({ username: config.ADMIN_USERNAME, password: config.ADMIN_PASSWORD }),
    );
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const headers = {
      Cookie: cookie,
      "Content-Type": "application/json",
      "If-Match": String(store.revision()),
    };
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
    const defaultMessage = await (
      await req(
        "/api/messages",
        post({ text: "Two minutes together" }, { Cookie: cookie }),
      )
    ).json();
    assert.equal(defaultMessage.expiresAt - defaultMessage.startsAt, 120000);
    store.saveSettings({
      ...store.settings(),
      messaging: { mode: "clock", defaultDuration: 60, blink: false },
    });
    const customDefault = await (
      await req("/api/messages", post({ text: "Our custom default" }, { Cookie: cookie }))
    ).json();
    assert.equal(customDefault.expiresAt - customDefault.startsAt, 60000);
    assert.equal(
      (
        await req(
          "/api/factory-reset",
          post({
            password: config.ADMIN_PASSWORD,
            confirmation: "RESET",
            eraseHistory: false,
          }),
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await req(
          "/api/factory-reset",
          post(
            { password: "wrong", confirmation: "RESET", eraseHistory: false },
            { Cookie: cookie },
          ),
        )
      ).status,
      403,
    );
    assert.equal(store.settings().backlight, false);
    assert.equal(
      (
        await req(
          "/api/factory-reset",
          post(
            { password: config.ADMIN_PASSWORD, confirmation: "no", eraseHistory: true },
            { Cookie: cookie },
          ),
        )
      ).status,
      400,
    );
    assert.equal(store.resetRevision(), 0);
    const count = store.history().items.length,
      revision = store.revision();
    assert.equal(
      (
        await req(
          "/api/factory-reset",
          post(
            {
              password: config.ADMIN_PASSWORD,
              confirmation: "RESET",
              eraseHistory: false,
            },
            { Cookie: cookie },
          ),
        )
      ).status,
      200,
    );
    assert.deepEqual(store.settings(), defaults);
    assert.equal(store.revision(), revision + 1);
    assert.equal(store.resetRevision(), 1);
    assert.equal(store.history().items.length, count);
    assert.ok(store.messages().every((m) => m.cancelled));
    assert.equal(
      (
        await req(
          "/api/factory-reset",
          post(
            {
              password: config.ADMIN_PASSWORD,
              confirmation: "RESET",
              eraseHistory: true,
            },
            { Cookie: cookie },
          ),
        )
      ).status,
      200,
    );
    assert.equal(store.resetRevision(), 2);
    const resetState = await (await req("/api/state", { headers })).json();
    assert.equal(resetState.resetRevision, 2);
    assert.equal(store.history().items.length, 0);
    assert.equal(store.activity().items.length, 1);
    assert.equal(store.activity().items[0].action, "factory.reset");
    assert.equal(store.users().length, 1);
    assert.equal((await req("/api/state", { headers })).status, 200);
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

test("both partners can manage settings, message history and accounts with private attribution", async () => {
  const path = mkdtempSync(join(tmpdir(), "mb-couple-api-")),
    store = new Store(path);
  const config = readConfig({
    ADMIN_PASSWORD: "husband-password-123",
    PARTNER_PASSWORD: "wife-password-12345",
    ADMIN_NAME: "Husband",
    PARTNER_NAME: "Wife",
    MQTT_PASSWORD: "mqtt-password-12345",
  });
  const runtime = {
    snapshot: (): Snapshot => ({
      settings: store.settings(),
      frame: render(store.settings(), store.messages()),
      settingsRevision: store.revision(),
      resetRevision: store.resetRevision(),
      messages: store.messages(),
      serverTime: Date.now(),
      deviceId: "uno-r4",
      broker: false,
      device: {
        online: false,
        lastSeen: null,
        rssi: null,
        ip: null,
        firmware: null,
        seq: null,
      },
    }),
    changed: () => {},
    listen: () => () => {},
  };
  const server = createApp(config, store, runtime).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const request = (
    route: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    extra = {},
  ) =>
    fetch(origin + "/api/" + route, {
      method,
      headers: { Cookie: cookie, "Content-Type": "application/json", ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async (username: string, password: string) => {
    const response = await request("login", "POST", { username, password });
    assert.equal(response.status, 200);
    return response.headers.get("set-cookie")!.split(";")[0];
  };
  try {
    for (const route of ["messages", "users", "activity"])
      assert.equal((await request(route)).status, 401);
    const his = await login("husband", config.ADMIN_PASSWORD),
      hers = await login("wife", config.PARTNER_PASSWORD!);
    const wife = store.users().find((u) => u.username === "wife")!;
    const state = await (await request("state", "GET", undefined, hers)).json();
    assert.equal((await request("settings", "PUT", state.settings, hers)).status, 428);
    const love = {
      ...state.settings,
      displayMode: "love",
      love: { ...state.settings.love, startAt: "2024-02-14T18:19:20.000Z" },
    };
    assert.equal(
      (
        await request("settings", "PUT", love, hers, {
          "If-Match": String(state.settingsRevision),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request("settings", "PUT", state.settings, his, {
          "If-Match": String(state.settingsRevision),
        })
      ).status,
      409,
    );
    const revision = String(store.revision());
    assert.equal(
      (
        await request(
          "settings",
          "PUT",
          { ...love, love: { ...love.love, startAt: "2099-01-01T00:00:00Z" } },
          his,
          { "If-Match": revision },
        )
      ).status,
      400,
    );
    const note = await request(
      "messages",
      "POST",
      { text: "Always you <3", duration: 15 },
      hers,
    );
    assert.equal(note.status, 201);
    const sent = await note.json();
    assert.equal(sent.authorId, wife.id);
    const history = await (
      await request("messages?q=Always", "GET", undefined, his)
    ).json();
    assert.equal(history.items[0].text, "Always you <3");
    assert.equal(history.items[0].authorName, "Wife");
    assert.equal(
      (await request(`messages/${sent.id}/replay`, "POST", undefined, his)).status,
      201,
    );
    const logs = await (await request("activity", "GET", undefined, hers)).json();
    assert.ok(
      logs.items.some(
        (e: { action: string; actorId: string }) =>
          e.action === "settings.updated" && e.actorId === wife.id,
      ),
    );
    assert.ok(!JSON.stringify(logs).includes(config.ADMIN_PASSWORD));
    const people = await (await request("users", "GET", undefined, hers)).json();
    assert.equal(people.items.length, 2);
    assert.ok(!JSON.stringify(people).includes("passwordHash"));
    const creation = await request(
      "users",
      "POST",
      { username: "guest", name: "Guest", password: "guest-password-1234" },
      hers,
    );
    assert.equal(creation.status, 201);
    assert.equal(
      (await request(`users/${wife.id}`, "PATCH", { enabled: false }, hers)).status,
      409,
    );
    assert.equal(
      (await request(`users/${wife.id}`, "PATCH", { enabled: false }, his)).status,
      200,
    );
    assert.equal((await request("state", "GET", undefined, hers)).status, 401);
    assert.equal(
      (await request("activity?before=oops", "GET", undefined, his)).status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
