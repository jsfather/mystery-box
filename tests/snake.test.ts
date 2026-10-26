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
    interval: 350,
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

test("native arcade rules: first-input start, toroidal Snake, adjustable pace and Tetris gameplay", () => {
  const dir = mkdtempSync(join(tmpdir(), "mystery-arcade-"));
  try {
    writeFileSync(
      join(dir, "test.cpp"),
      `#include <cassert>
#include <cstring>
#include "snake_game.h"
#include "tetris_game.h"
int main() {
  SnakeGame game; uint8_t pixels[8][12];
  for (uint8_t heading = 0; heading < 4; ++heading) {
    const uint32_t start = 0xfffffff0UL;
    game.start(start, 7, 200); assert(game.status == SnakeGame::Ready);
    assert(!game.tick(start + 10000)); game.pause(); game.resume(start + 10000);
    assert(game.status == SnakeGame::Ready);
    assert(game.turn(heading, start));
    assert(!game.turn((heading + 2) % 4, start));
    assert(!game.tick(start + 199));
    int x = 4, y = 3;
    const int moves = heading == 0 ? 4 : heading == 1 ? 8 : heading == 2 ? 5 : 5;
    for (int step = 1; step <= moves; ++step) {
      x = (x + (heading == 1 ? 1 : heading == 3 ? -1 : 0) + 12) % 12;
      y = (y + (heading == 2 ? 1 : heading == 0 ? -1 : 0) + 8) % 8;
      assert(game.tick(start + step * 200));
      assert(game.status == SnakeGame::Playing); assert(game.head() == y * 12 + x);
    }
  }
  game.start(0, 7, 200); assert(game.turn(1, 0));
  assert(game.turn(0)); assert(game.turn(3)); assert(!game.turn(2));
  assert(game.tick(200)); assert(game.head() == 28);
  assert(game.tick(400)); assert(game.head() == 27);
  game.pause(); const auto head = game.head(); assert(!game.tick(100000)); assert(game.head() == head);
  game.configure(600, 100000); game.resume(100000);
  assert(!game.tick(100599)); assert(game.tick(100600));
  uint8_t cycle[96]; int count = 0;
  for (int y = 0; y < 8; ++y) {
    if (y % 2 == 0) for (int x = 10; x >= 0; --x) cycle[count++] = y * 12 + x;
    else for (int x = 0; x <= 10; ++x) cycle[count++] = y * 12 + x;
  }
  for (int y = 7; y >= 0; --y) cycle[count++] = y * 12 + 11;
  assert(count == 96);
  game.start(0, 42, 200); game.turn(1, 0); uint32_t now = 0;
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
  game.start(0, 42, 200); game.turn(1, 0); now = 0;
  for (int move = 0; move < 1000 && game.score() < 2; ++move) {
    int at = 0; while (cycle[at] != game.head()) ++at;
    const int next = cycle[(at+1)%96], dx = next%12-game.head()%12, dy=next/12-game.head()/12;
    game.turn(dx==1?1:dx==-1?3:dy==1?2:0); now += 200; game.tick(now);
  }
  assert(game.score() >= 2);
  for (int step = 0; step < 4 && game.status == SnakeGame::Playing; ++step) {
    game.turn((game.direction()+1)%4); now += 200; game.tick(now);
  }
  assert(game.status == SnakeGame::Over);
  game.stop(); game.pixels(pixels); for (auto& row : pixels) for (auto p : row) assert(!p);

  TetrisGame blocks;
  blocks.start(0xfffffff0UL, 42); assert(blocks.status == TetrisGame::Ready);
  assert(!blocks.tick(100000)); blocks.control(1, 0xfffffff0UL);
  assert(!blocks.tick(883)); assert(blocks.tick(884));
  blocks.configure(300, 884); assert(!blocks.tick(1183)); assert(blocks.tick(1184));
  blocks.pause(); const auto revision = blocks.revision; assert(!blocks.tick(100000)); assert(blocks.revision == revision);
  blocks.resume(100000); assert(!blocks.tick(100299)); assert(blocks.tick(100300));
  uint16_t rows[8] = {1,2,4,8,16,32,0xfff,0xfff};
  assert(TetrisGame::clearRows(rows) == 2);
  const uint16_t expected[8] = {0,0,1,2,4,8,16,32}; assert(!memcmp(rows, expected, sizeof(rows)));
  blocks.start(0, 42); uint8_t seen = 0;
  for (uint8_t piece = 0; piece < 7; ++piece) {
    assert(blocks.status != TetrisGame::Over); seen |= 1U << blocks.piece();
    // Move to the left edge, then spread pieces over three lanes.
    for (int move = 0; move < 16; ++move) blocks.control(3, piece * 100);
    for (int move = 0; move < (piece % 3) * 4; ++move) blocks.control(1, piece * 100);
    assert(blocks.drop(piece * 100));
  }
  assert(seen == 127); assert(blocks.score() > 0);
  blocks.start(0, 9);
  for (int move = 0; move < 16; ++move) blocks.control(3, 0);
  blocks.control(0, 0); blocks.control(0, 0); blocks.control(0, 0);
  struct { uint8_t pixels[8][12]; uint32_t guard; } view; view.guard = 0x12345678;
  blocks.pixels(view.pixels); assert(view.guard == 0x12345678);
  for (auto& row : view.pixels) for (auto pixel : row) assert(pixel <= 1);
  blocks.start(0, 42);
  for (int piece = 0; piece < 100 && blocks.status != TetrisGame::Over; ++piece) blocks.drop(piece * 100);
  assert(blocks.status == TetrisGame::Over); assert(!blocks.tick(999999));
  blocks.stop(); blocks.pixels(pixels); for (auto& row : pixels) for (auto p : row) assert(!p);
}
`,
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

test("each game keeps its pace and controller commands preserve game identity", async () => {
  const { gameDefaults, gameSettingsSchema } = await import("../shared/games.js");
  const { settingsSchema, defaults } = await import("../shared/model.js");
  const legacy: any = structuredClone(defaults);
  delete legacy.games;
  assert.deepEqual(settingsSchema.parse(legacy).games, gameDefaults);
  const settings = structuredClone(gameDefaults),
    commands: any[] = [];
  const controller = new SnakeController(
    (command) => {
      commands.push(command);
      return true;
    },
    () => true,
    () => true,
    () => settings,
  );
  const user = { id: "one", name: "Player" };
  const started = controller.request(
    { action: "start", game: "tetris", direction: "left" },
    user,
    1000,
  );
  assert.equal(commands[0].kind, "tetris");
  assert.equal(commands[0].direction, 3);
  assert.equal(commands[0].interval, 900);
  const state = {
    v: 1,
    kind: "tetris",
    id: started.game!.id,
    revision: 1,
    status: "ready",
    score: 0,
    interval: 900,
    matrix: "0".repeat(24),
    active: "0".repeat(24),
    lines: 0,
  };
  assert.equal(controller.receive({ ...state, kind: "snake" }, 1100), false);
  assert.equal(controller.receive(state, 1100), true);
  controller.request({ action: "drop", token: started.token! }, user, 1200);
  assert.equal(commands.at(-1).action, "drop");
  settings.tetris.fallMs = 500;
  controller.configure();
  assert.equal(commands.at(-1).action, "configure");
  assert.equal(commands.at(-1).interval, 500);
  assert.equal(settings.snake.moveMs, 350);
  controller.tick(2200);
  assert.equal(commands.at(-1).action, "configure");
  assert.equal(
    controller.receive({ ...state, interval: 500, revision: 2, status: "playing" }, 2300),
    true,
  );
  controller.tick(3200);
  assert.equal(commands.at(-1).action, "keepalive");
  controller.request({ action: "stop", token: started.token! }, user, 3300);
  const snake = controller.request({ action: "start", game: "snake" }, user, 3400);
  assert.equal(commands.at(-1).interval, 350);
  assert.equal(commands.at(-1).direction, undefined);
  assert.throws(
    () => controller.request({ action: "drop", token: snake.token! }, user, 3500),
    (error: any) => error.status === 400,
  );
  assert.equal(
    gameSettingsSchema.safeParse({ ...settings, snake: { moveMs: 50 } }).success,
    false,
  );
  assert.equal(
    gameSettingsSchema.safeParse({ ...settings, tetris: { fallMs: 350 } }).success,
    false,
  );
  assert.equal(
    controller.receive(
      {
        ...state,
        id: snake.game!.id,
        kind: "snake",
        head: 40,
        food: 12,
        interval: 350,
        status: "idle",
      },
      3600,
    ),
    true,
  );
  assert.equal(controller.snapshot(), null);
});
