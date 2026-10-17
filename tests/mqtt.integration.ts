// Run against an isolated Compose stack, never against a live user's board.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import mqtt from "mqtt";
import { setTimeout as pause } from "node:timers/promises";
import { defaults, type Frame } from "../shared/model.js";
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
  await device.subscribeAsync(`${base}/frame`);
  device.on("message", (_topic, buffer) => {
    const parsed = JSON.parse(buffer.toString());
    if (parsed.unauthorized) forged = true;
    else latest = parsed;
  });
  await device.publishAsync(`${base}/hello`, "{}");
  await until(
    async () => latest,
    (f) => !!f,
  );
  assert.equal(latest!.line1.length, 16);
  assert.equal(latest!.matrix.length, 24);
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
