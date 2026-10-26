import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { SnakeController, GameError } from "../server/snake.js";
import { snakeRequestSchema } from "../shared/snake.js";

test("controller leases enforce ownership, validate board state and expire safely", () => {
  const commands: any[] = [];
  let ready = true;
  const game = new SnakeController(
    (command) => {
      commands.push(command);
      return ready;
    },
    () => ready,
  );
  const user = { id: "one", name: "Player One" };
  const started = game.request({ action: "start" }, user, 1000);
  assert.ok(started.token);
  const id = started.game!.id;
  assert.equal(commands[0].action, "start");
  assert.equal(JSON.stringify(game.snapshot()).includes(started.token!), false);
  assert.throws(
    () => game.request({ action: "start" }, user, 1100),
    (e: any) => e.status === 409,
  );
  assert.throws(
    () =>
      game.request(
        { action: "turn", token: started.token!, direction: "up" },
        { id: "two", name: "Player Two" },
        1200,
      ),
    GameError,
  );
  game.tick(2000);
  assert.equal(commands.at(-1).action, "start");
  const state = {
    v: 1,
    id,
    revision: 3,
    status: "playing",
    score: 0,
    head: 40,
    food: 12,
    direction: 1,
    interval: 280,
    matrix: "0".repeat(24),
  };
  assert.equal(game.receive({ ...state, id: "not-a-session" }, 2100), false);
  assert.equal(game.receive({ ...state, score: 100 }, 2100), false);
  assert.equal(game.receive(state, 2100), true);
  assert.equal(game.receive({ ...state, revision: 2 }, 2200), false);
  game.tick(3000);
  assert.equal(commands.at(-1).action, "keepalive");
  game.request({ action: "turn", token: started.token!, direction: "up" }, user, 3100);
  assert.equal(commands.at(-1).direction, 0);
  assert.throws(
    () =>
      game.request(
        { action: "turn", token: started.token!, direction: "left" },
        user,
        3120,
      ),
    (e: any) => e.status === 429,
  );
  game.tick(11100);
  assert.equal(game.snapshot(), null);
  assert.equal(commands.at(-1).action, "stop");
  game.request({ action: "start" }, user, 12000);
  ready = false;
  game.tick(12100);
  assert.equal(game.snapshot(), null);
  assert.throws(
    () => game.request({ action: "start" }, user, 13000),
    (e: any) => e.status === 503,
  );
  assert.equal(
    snakeRequestSchema.safeParse({
      action: "turn",
      token: started.token,
      direction: "north",
    }).success,
    false,
  );
  assert.equal(
    snakeRequestSchema.safeParse({ action: "start", token: started.token }).success,
    false,
  );
});

test("firmware Snake handles turn queues, walls, pause, rollover, food, tail and a full-board win", () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-snake-"));
  try {
    writeFileSync(
      join(dir, "test.cpp"),
      `
#include <cassert>
#include "snake_game.h"
int main() {
  SnakeGame game; uint8_t pixels[8][12];
  game.start(0xfffffff0UL, 7);
  assert(!game.turn(3)); // Cannot reverse into the neck.
  assert(game.turn(0)); assert(game.turn(3)); assert(!game.turn(2));
  assert(!game.tick(100)); assert(game.tick(264)); assert(game.head() == 28);
  assert(game.tick(544)); assert(game.head() == 27);
  game.pause(); const auto head = game.head();
  assert(!game.tick(100000)); assert(game.head() == head);
  game.resume(100000); assert(!game.tick(100100)); assert(game.tick(100280));
  game.start(0, 7);
  for (int t = 1; t <= 8; ++t) game.tick(t * 280);
  assert(game.status == SnakeGame::Over); assert(!game.tick(999999));
  game.stop(); game.pixels(pixels);
  for (auto& row : pixels) for (auto p : row) assert(!p);
  // Follow a Hamiltonian cycle until every cell is filled. This also exercises
  // food placement and moving into the vacated tail with no heap allocation.
  uint8_t cycle[96]; int count = 0;
  for (int y = 0; y < 8; ++y) {
    if (y % 2 == 0) for (int x = 10; x >= 0; --x) cycle[count++] = y * 12 + x;
    else for (int x = 0; x <= 10; ++x) cycle[count++] = y * 12 + x;
  }
  for (int y = 7; y >= 0; --y) cycle[count++] = y * 12 + 11;
  assert(count == 96);
  game.start(0, 42); uint32_t now = 0;
  for (int move = 0; move < 10000 && game.status == SnakeGame::Playing; ++move) {
    int at = 0; while (cycle[at] != game.head()) ++at;
    const int next = cycle[(at + 1) % 96];
    const int dx = next % 12 - game.head() % 12, dy = next / 12 - game.head() / 12;
    game.turn(dx == 1 ? 1 : dx == -1 ? 3 : dy == 1 ? 2 : 0);
    now += game.interval(); assert(game.tick(now));
    game.pixels(pixels); int lit = 0; for (auto& row : pixels) for (auto p : row) lit += p;
    assert(lit == game.score() + 3 + (game.status == SnakeGame::Won ? 0 : 1));
  }
  assert(game.status == SnakeGame::Won); assert(game.score() == 93);
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

test("game API requires a session, checks origin, validates controls and prevents takeover", async () => {
  const { createApp } = await import("../server/app.js");
  const { Store } = await import("../server/store.js");
  const { readConfig } = await import("../server/config.js");
  const { render } = await import("../server/render.js");
  const path = mkdtempSync(join(tmpdir(), "mystery-snake-api-")),
    store = new Store(path);
  const config = readConfig({
    ADMIN_PASSWORD: "snake-test-password-only",
    MQTT_PASSWORD: "snake-mqtt-password-only",
    APP_ORIGIN: "http://localhost:5173",
  });
  const sent: object[] = [];
  const game = new SnakeController(
    (command) => {
      sent.push(command);
      return true;
    },
    () => true,
  );
  const app = createApp(config, store, {
    snapshot: () => ({
      settings: store.settings(),
      frame: render(store.settings(), []),
      device: {
        online: true,
        snake: true,
        lastSeen: Date.now(),
        rssi: -40,
        ip: null,
        firmware: "1.5.0",
        seq: 1,
      },
      broker: true,
      messages: [],
      serverTime: Date.now(),
      deviceId: "test",
      settingsRevision: 0,
      resetRevision: 0,
      snake: game.snapshot(),
    }),
    changed: () => {},
    listen: () => () => {},
    snake: (input, user) => game.request(input, user),
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
    assert.equal((await post("snake", { action: "start" })).status, 401);
    const login = await post("login", {
      username: "husband",
      password: config.ADMIN_PASSWORD,
    });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.equal(
      (await post("snake", { action: "start" }, "https://other.example")).status,
      403,
    );
    assert.equal((await post("snake", { action: "fly" })).status, 400);
    const start = await post("snake", { action: "start" });
    assert.equal(start.status, 200);
    const { token } = await start.json();
    assert.ok(token);
    assert.equal((await post("snake", { action: "start" })).status, 409);
    assert.equal(
      (
        await post("snake", {
          action: "turn",
          direction: "up",
          token: "11111111-1111-4111-8111-111111111111",
        })
      ).status,
      409,
    );
    assert.equal((await post("snake", { action: "pause", token })).status, 200);
    assert.equal((sent.at(-1) as any).action, "pause");
    assert.equal((await post("snake", { action: "stop", token })).status, 200);
    assert.equal(game.snapshot(), null);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(path, { recursive: true, force: true });
  }
});
