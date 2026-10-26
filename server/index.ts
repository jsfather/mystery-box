import mqtt from "mqtt";
import { readConfig } from "./config.js";
import { Store } from "./store.js";
import { render } from "./render.js";
import { createApp } from "./app.js";
import { z } from "zod";
import type { Device, Snapshot } from "../shared/model.js";
import { matrixProgram, matrixNeedsStream } from "../shared/matrix.js";
import { SnakeController } from "./snake.js";
let config;
try {
  config = readConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
const store = new Store(config.DATA_DIR),
  base = `mystery-box/${config.DEVICE_ID}`;
let settings = store.settings(),
  messages = store.messages(),
  seq = 0;
let device: Device = {
  online: false,
  lastSeen: null,
  rssi: null,
  ip: null,
  firmware: null,
  seq: null,
};
let frame = render(settings, messages),
  broker = false;
const listeners = new Set<() => void>();
const client = mqtt.connect(config.MQTT_URL, {
  username: config.MQTT_USERNAME,
  password: config.MQTT_PASSWORD,
  clientId: `mb-server-${config.DEVICE_ID}`,
  clean: true,
  reconnectPeriod: 3000,
  connectTimeout: 10000,
  queueQoSZero: false,
  resubscribe: true,
});
const game = new SnakeController(
  (command) => {
    if (!client.connected) return false;
    client.publish(`${base}/game`, JSON.stringify(command), { qos: 0, retain: false });
    return true;
  },
  () =>
    broker &&
    device.online &&
    device.snake === true &&
    Date.now() - (device.lastSeen ?? 0) < 45000,
  () => (device.errors ?? 0) === 0,
);
const telemetry = z.object({
  online: z.boolean(),
  lcdScroll: z.boolean().optional(),
  snake: z.boolean().optional(),
  errors: z.number().int().min(0).max(255).optional(),
  occurred: z.number().int().min(0).max(255).optional(),
  rssi: z.number().min(-150).max(0).optional(),
  ip: z.string().max(45).optional(),
  firmware: z.string().max(32).optional(),
  seq: z.number().int().min(0).max(4294967295).optional(),
  matrixRevision: z.number().int().min(0).max(4294967295).optional(),
});
client.on("connect", () => {
  broker = true;
  store.audit(null, "broker.connected");
  client.subscribe([`${base}/status`, `${base}/hello`, `${base}/game/state`], { qos: 1 });
  console.log("MQTT connected");
  publishMatrix();
});
client.on("offline", () => {
  if (broker) store.audit(null, "broker.disconnected");
  broker = false;
  device.online = false;
  game.release();
});
client.on("close", () => {
  if (broker) store.audit(null, "broker.disconnected");
  broker = false;
  device.online = false;
  game.release();
});
let lastBrokerErrorAt = 0;
client.on("error", () => {
  if (Date.now() - lastBrokerErrorAt >= 60000) {
    store.audit(null, "broker.error", {
      message: "MQTT connection failed; check broker address and credentials",
    });
    lastBrokerErrorAt = Date.now();
  }
  broker = false;
  console.error(
    "MQTT connection failed; retrying. Check broker address and credentials.",
  );
});
client.on("message", (topic, payload, packet) => {
  if (payload.length > 1024) return;
  if (topic === `${base}/hello`) {
    if (!packet.retain && client.connected) {
      publishMatrix();
      publish(true);
    }
    return;
  }
  if (topic === `${base}/game/state`) {
    if (!packet.retain) {
      try {
        if (game.receive(JSON.parse(payload.toString())))
          for (const fn of listeners) fn();
      } catch {
        /* Ignore invalid state. */
      }
    }
    return;
  }
  try {
    const t = telemetry.safeParse(JSON.parse(payload.toString()));
    if (!t.success) return;
    // A retained online status belongs to an old connection and cannot prove liveness.
    if (t.data.online && packet.retain) return;
    if (t.data.online) {
      const previous = device.errors ?? 0,
        current = t.data.errors ?? 0;
      const raised = (current & ~previous) | (t.data.occurred ?? 0);
      for (let bit = 0; bit < 8; bit++) {
        if (raised & (1 << bit))
          store.audit(null, "device.error", { code: `E${bit + 1}` });
        if ((previous | raised) & ~current & (1 << bit))
          store.audit(null, "device.recovered", { code: `E${bit + 1}` });
      }
    }
    device = {
      ...device,
      ...t.data,
      online: t.data.online,
      lastSeen: t.data.online ? Date.now() : device.lastSeen,
    };
  } catch {
    /* Ignore invalid device telemetry. */
  }
});
let lastPublishedAt = 0,
  lastDisplaySignature = "";
function publishMatrix() {
  if (client.connected)
    client.publish(`${base}/matrix`, JSON.stringify(matrixProgram(settings.matrix)), {
      qos: 1,
      retain: true,
    });
}
function publish(force = false) {
  frame = render(settings, messages, Date.now(), (seq = (seq + 1) >>> 0));
  const modern = device.lcdScroll === true;
  const signature = JSON.stringify([
    frame.clock,
    frame.love,
    frame.clockTop,
    frame.scroll?.id,
    frame.clock || frame.love || frame.clockTop ? "" : frame.line1,
    frame.clock || frame.love || frame.scroll ? "" : frame.line2,
    frame.dateKey,
    frame.offset,
  ]);
  const changed = signature !== lastDisplaySignature;
  const legacyScroll =
    !frame.clock && !frame.love && !modern && device.firmware !== "1.4.0";
  const dynamic =
    legacyScroll || matrixNeedsStream(settings.matrix, device.matrixRevision);
  if (
    !force &&
    !changed &&
    !dynamic &&
    Date.now() - lastPublishedAt < (modern ? 10000 : 1000)
  )
    return;
  lastPublishedAt = Date.now();
  lastDisplaySignature = signature;
  let packet = frame;
  if (!modern && device.firmware !== "1.4.0") packet = { ...frame, scroll: null };
  else if (!modern && frame.scroll) {
    const message = messages.find((m) => m.id === frame.scroll!.id);
    packet = {
      ...frame,
      scroll: {
        ...frame.scroll,
        stepMs: 300,
        phase: message
          ? (Date.now() - message.startsAt) % ((message.text.length + 4) * 300)
          : 0,
      },
    };
  }
  if (client.connected)
    client.publish(`${base}/frame`, JSON.stringify(packet), { qos: 0, retain: false });
}
let wasOnline = false;
store.audit(null, "server.started");
const timer = setInterval(() => {
  const online = broker && device.online && Date.now() - (device.lastSeen ?? 0) < 45000;
  if (online !== wasOnline) {
    store.audit(null, online ? "device.online" : "device.offline");
    wasOnline = online;
  }
  game.tick();
  publish();
  for (const fn of listeners) fn();
}, 200);
const snapshot = (): Snapshot => ({
  snake: game.snapshot(),
  settings,
  frame,
  device: {
    ...device,
    online: broker && device.online && Date.now() - (device.lastSeen ?? 0) < 45000,
  },
  broker,
  messages,
  serverTime: Date.now(),
  deviceId: config.DEVICE_ID,
  settingsRevision: store.revision(),
  resetRevision: store.resetRevision(),
});
const app = createApp(config, store, {
  snapshot,
  snake: (request, user) => {
    const result = game.request(request, user);
    for (const fn of listeners) fn();
    return result;
  },
  changed: () => {
    const previousMatrix = JSON.stringify(settings.matrix);
    settings = store.settings();
    messages = store.messages();
    if (previousMatrix !== JSON.stringify(settings.matrix)) publishMatrix();
    publish(true);
    for (const fn of listeners) fn();
  },
  listen: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
});
const server = app.listen(config.PORT, "0.0.0.0", () =>
  console.log(`Mystery Box listening at http://localhost:${config.PORT}`),
);
function shutdown() {
  game.release();
  clearInterval(timer);
  server.close();
  server.closeAllConnections();
  client.end(true);
  store.audit(null, "server.stopped");
  store.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
