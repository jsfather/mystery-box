// Run against an isolated Compose stack, never against a live user's board.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import mqtt from "mqtt";
import { setTimeout as pause } from "node:timers/promises";
import { defaults, type Frame } from "../shared/model.js";
import { matrixProgram } from "../shared/matrix.js";
const env = Object.fromEntries(
  readFileSync(process.env.TEST_ENV_FILE ?? "/tmp/mystery-box-verification.env", "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const url = process.env.TEST_HTTP_URL ?? "http://127.0.0.1:3307",
  broker = process.env.TEST_MQTT_URL ?? "mqtt://127.0.0.1:1883";
const base = `mystery-box/${env.DEVICE_ID ?? "uno-r4"}`;
const login = await fetch(url + "/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: env.ADMIN_USERNAME ?? "husband",
    password: env.ADMIN_PASSWORD,
  }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")!.split(";")[0];
async function api(path: string, method = "GET", body?: unknown): Promise<any> {
  const revision =
    path === "settings" ? (await api("state")).settingsRevision : undefined;
  const response = await fetch(url + "/api/" + path, {
    method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(revision !== undefined ? { "If-Match": String(revision) } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `${path}: ${response.status}`);
  return response.json();
}
async function until<T>(
  action: () => Promise<T>,
  accept: (value: T) => boolean,
  timeout = 5000,
) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await action();
    if (accept(value)) return value;
    await pause(100);
  }
  throw new Error("Condition timed out");
}
let latest: Frame | undefined,
  forged = false;
let gameCommand:
  { id: string; action: string; direction?: number; seq: number } | undefined;
let gameRetained = false;
let program: ReturnType<typeof matrixProgram> | undefined;
const device = await mqtt.connectAsync(broker, {
  username: "device",
  password: env.MQTT_DEVICE_PASSWORD,
  clientId: "mb-integration-test",
  reconnectPeriod: 0,
  will: {
    topic: `${base}/status`,
    payload: Buffer.from('{"online":false}'),
    qos: 1,
    retain: true,
  },
});
try {
  device.on("message", (topic, buffer, packet) => {
    const parsed = JSON.parse(buffer.toString());
    if (topic === `${base}/game`) {
      gameCommand = parsed;
      gameRetained = packet.retain;
      return;
    }
    if (topic === `${base}/matrix`) {
      program = parsed;
      return;
    }
    if (parsed.unauthorized) forged = true;
    else latest = parsed;
  });
  await device.subscribeAsync([`${base}/frame`, `${base}/matrix`, `${base}/game`]);
  await device.publishAsync(`${base}/hello`, "{}");
  await until(
    async () => latest,
    (f) => !!f,
  );
  assert.equal(latest!.line1.length, 16);
  assert.equal(latest!.matrix.length, 24);
  await until(
    async () => program,
    (p) => !!p,
  );
  assert.deepEqual(program, matrixProgram((await api("state")).settings.matrix));
  await device.unsubscribeAsync(`${base}/matrix`);
  program = undefined;
  await device.subscribeAsync(`${base}/matrix`);
  await until(
    async () => program,
    (p) => !!p,
  ); // retained program also survives reconnect/subscription races
  await device.publishAsync(
    `${base}/status`,
    JSON.stringify({
      online: true,
      rssi: -45,
      ip: "127.0.0.1",
      firmware: "integration",
      seq: latest!.seq,
    }),
  );
  await until(
    () => api("state"),
    (s) => s.device.online,
  );
  console.log("PASS MQTT frames, hello and fresh telemetry");
  await api("settings", "PUT", {
    ...defaults,
    timezone: "UTC",
    calendar: "gregory",
    backlight: false,
    matrix: {
      ...defaults.matrix,
      mode: "custom",
      frames: ["800000000000000000000001"],
    },
  });
  await until(
    async () => latest,
    (f) => !!f && !f.backlight && f.matrix === "800000000000000000000001",
  );
  console.log("PASS dashboard settings reach MQTT device");
  const m = await api("messages", "POST", {
    text: "Integration hello",
    duration: 5,
  });
  await until(
    async () => latest,
    (f) => !!f && !f.clock,
  );
  await api("messages/" + m.id, "DELETE");
  await until(
    async () => latest,
    (f) => !!f && f.clock,
  );
  console.log("PASS message and cancellation reach device");
  const beforeDeletion = (await api("state")).historyRevision;
  await api("settings", "PUT", {
    ...defaults,
    messaging: { ...defaults.messaging, blink: true },
  });
  const alert = await api("messages", "POST", {
    text: "A bright new hello",
    duration: 30,
  });
  await until(
    async () => latest,
    (f) => !!f && f.messageId === alert.id && f.notify && f.messageAge < 4000,
  );
  const removed = await api("messages/delete", "POST", { ids: [alert.id] });
  assert.deepEqual(removed.deletedIds, [alert.id]);
  await until(
    async () => latest,
    (f) => !!f && f.clock && f.messageId === "",
  );
  assert.equal((await api("state")).historyRevision, beforeDeletion + 1);
  assert.equal(
    (await api("messages/lookup", "POST", { ids: [alert.id] })).items.length,
    0,
  );
  console.log("PASS new-message alert intent and deletion stop active LCD output");

  await api("settings", "PUT", {
    ...defaults,
    timezone: "UTC",
    messaging: { mode: "clock", defaultDuration: 120, blink: false, scrollStepMs: 400 },
  });
  const chat = await api("messages", "POST", {
    text: "Our conversation reaches the little box",
  });
  assert.equal(chat.expiresAt - chat.startsAt, 120000);
  await until(
    async () => latest,
    (f) => !!f && /^\s*\d{2}:\d{2}:\d{2}\s*$/.test(f.line1) && !f.clock,
  );
  assert.equal(latest!.line2.length, 16);
  await api(`messages/${chat.id}`, "DELETE");
  console.log("PASS two-minute default and clock-above-message layout reach MQTT device");
  const loveStart = "2020-02-14T14:49:20.000Z";
  await api("settings", "PUT", {
    ...defaults,
    displayMode: "love",
    love: { ...defaults.love, startAt: loveStart },
  });
  await until(
    async () => latest,
    (frame) =>
      !!frame &&
      frame.love &&
      frame.loveEnabled &&
      frame.loveSince === Date.parse(loveStart) / 1000,
  );
  assert.match(latest!.line2, /\d+d \d{2}:\d{2}:\d{2}/);
  console.log("PASS love counter and offline starting instant reach MQTT device");
  await api("settings", "PUT", {
    ...defaults,
    displayMode: "love",
    love: { ...defaults.love, startAt: loveStart, format: "seconds" },
  });
  await until(
    async () => latest,
    (f) => !!f && f.love && f.loveFormat === 1 && /\d+s\s*$/.test(f.line2),
  );
  console.log("PASS total-seconds counter and offline format reach MQTT device");
  // Verify the complete control path against the real broker and its ACLs.
  await device.publishAsync(
    `${base}/status`,
    JSON.stringify({
      online: true,
      firmware: "1.5.0",
      snake: true,
      lcdScroll: true,
      errors: 0,
      matrixRevision: program!.revision,
    }),
  );
  await until(
    () => api("state"),
    (s) => s.device.snake === true,
  );
  await api("settings", "PUT", {
    ...defaults,
    messaging: { ...defaults.messaging, mode: "clock", scrollStepMs: 800 },
  });
  const reading = await api("messages", "POST", {
    text: "A longer note deserves a comfortable reading pace",
    duration: 30,
  });
  await until(
    async () => latest,
    (f) => !!f && f.messageId === reading.id && f.scroll?.stepMs === 200,
  );
  // Capability negotiation applies the selected pace immediately after a firmware update.
  await device.publishAsync(
    `${base}/status`,
    JSON.stringify({
      online: true,
      firmware: "1.7.0",
      snake: true,
      lcdScroll: true,
      scrollSpeed: true,
      errors: 0,
      matrixRevision: program!.revision,
    }),
  );
  await until(
    async () => latest,
    (f) => !!f && f.messageId === reading.id && f.scroll?.stepMs === 800,
  );
  await api("settings", "PUT", {
    ...defaults,
    messaging: { ...defaults.messaging, mode: "clock", scrollStepMs: 600 },
  });
  await until(
    async () => latest,
    (f) => !!f && f.messageId === reading.id && f.scroll?.stepMs === 600,
  );
  await api("messages/delete", "POST", { ids: [reading.id] });
  console.log(
    "PASS adjustable reading speed, live changes and older-firmware compatibility",
  );
  const started = await api("snake", "POST", { action: "start" });
  await until(
    async () => gameCommand,
    (c) => c?.action === "start",
  );
  assert.equal(gameRetained, false);
  const gameId = gameCommand!.id;
  await device.publishAsync(
    `${base}/game/state`,
    JSON.stringify({
      v: 1,
      id: gameId,
      revision: 1,
      status: "playing",
      score: 0,
      head: 40,
      food: 12,
      direction: 1,
      interval: 280,
      matrix: "0".repeat(24),
    }),
  );
  await until(
    () => api("state"),
    (s) => s.snake?.state?.id === gameId,
  );
  const watched = await api("state");
  assert.equal(JSON.stringify(watched.snake).includes(started.token), false);
  await api("snake", "POST", { action: "turn", token: started.token, direction: "up" });
  await until(
    async () => gameCommand,
    (c) => c?.action === "turn" && c.direction === 0,
  );
  const turnSequence = gameCommand!.seq;
  await api("snake", "POST", { action: "stop", token: started.token });
  await until(
    async () => gameCommand,
    (c) => c?.action === "stop",
  );
  assert.ok(gameCommand!.seq > turnSequence);
  assert.equal((await api("state")).snake, null);
  const stoppedSequence = gameCommand!.seq;
  await device.publishAsync(`${base}/game`, JSON.stringify({ unauthorized: true }));
  await pause(300);
  assert.equal(gameCommand!.seq, stoppedSequence);
  console.log("PASS Snake start/state/steering/stop and dedicated topic ACLs");

  await device.publishAsync(`${base}/frame`, JSON.stringify({ unauthorized: true }), {
    qos: 0,
  });
  await pause(500);
  assert.equal(forged, false);
  console.log("PASS device ACL blocks publishing display frames");
  const bad = mqtt.connect(broker, {
    username: "device",
    password: "invalid-password",
    reconnectPeriod: 0,
    connectTimeout: 2000,
  });
  const rejected = await new Promise<boolean>((resolve) => {
    bad.once("connect", () => resolve(false));
    bad.once("error", () => resolve(true));
  });
  bad.end(true);
  assert.equal(rejected, true);
  console.log("PASS broker rejects incorrect device credentials");
  // Deliberately break the socket, rather than graceful DISCONNECT, to trigger will.
  device.stream.destroy();
  await until(
    () => api("state"),
    (s) => !s.device.online,
  );
  console.log("PASS last will marks hardware offline");
  await api("settings", "PUT", defaults);
} finally {
  await device.endAsync(true);
}
