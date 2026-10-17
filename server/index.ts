import mqtt from "mqtt";
import { readConfig } from "./config.js";
import { Store } from "./store.js";
import { render } from "./render.js";
import { createApp } from "./app.js";
import { z } from "zod";
import type { Device, Snapshot } from "../shared/model.js";
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
const telemetry = z.object({
  online: z.boolean(),
  rssi: z.number().min(-150).max(0).optional(),
  ip: z.string().max(45).optional(),
  firmware: z.string().max(32).optional(),
  seq: z.number().int().min(0).max(4294967295).optional(),
});
client.on("connect", () => {
  broker = true;
  store.audit(null, "broker.connected");
  client.subscribe([`${base}/status`, `${base}/hello`], { qos: 1 });
  console.log("MQTT connected");
});
client.on("offline", () => {
  if (broker) store.audit(null, "broker.disconnected");
  broker = false;
  device.online = false;
});
client.on("close", () => {
  if (broker) store.audit(null, "broker.disconnected");
  broker = false;
  device.online = false;
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
    if (!packet.retain && client.connected) publish(true);
    return;
  }
  try {
    const t = telemetry.safeParse(JSON.parse(payload.toString()));
    if (!t.success) return;
    // A retained online status belongs to an old connection and cannot prove liveness.
    if (t.data.online && packet.retain) return;
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
let lastPublishedAt = 0;
function publish(force = false) {
  frame = render(settings, messages, Date.now(), (seq = (seq + 1) >>> 0));
  // Clock/counter ticks and heart pulses run on the device. Avoid filling its
  // serial Wi-Fi bridge with redundant frames; keep scrolling/other effects at 5fps.
  const dynamic =
    !["off", "heart"].includes(settings.matrix.mode) || (!frame.clock && !frame.love);
  if (!force && !dynamic && Date.now() - lastPublishedAt < 1000) return;
  lastPublishedAt = Date.now();
  if (client.connected)
    client.publish(`${base}/frame`, JSON.stringify(frame), {
      qos: 0,
      retain: false,
    });
}
let wasOnline = false;
store.audit(null, "server.started");
const timer = setInterval(() => {
  const online = broker && device.online && Date.now() - (device.lastSeen ?? 0) < 45000;
  if (online !== wasOnline) {
    store.audit(null, online ? "device.online" : "device.offline");
    wasOnline = online;
  }
  publish();
  for (const fn of listeners) fn();
}, 200);
const snapshot = (): Snapshot => ({
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
  changed: () => {
    settings = store.settings();
    messages = store.messages();
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
