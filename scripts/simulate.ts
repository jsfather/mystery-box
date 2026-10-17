import mqtt from "mqtt";
const password = process.env.MQTT_DEVICE_PASSWORD;
if (!password) {
  console.error("Set MQTT_DEVICE_PASSWORD before running the simulator.");
  process.exit(1);
}
const id = process.env.DEVICE_ID ?? "uno-r4",
  base = `mystery-box/${id}`;
const client = mqtt.connect(process.env.SIMULATOR_MQTT_URL ?? "mqtt://127.0.0.1:1883", {
  username: "device",
  password,
  clientId: `mb-simulator-${id}`,
  rejectUnauthorized: true,
  will: {
    topic: `${base}/status`,
    payload: Buffer.from('{"online":false}'),
    qos: 1,
    retain: true,
  },
});
let seq = 0,
  seen = 0;
function status() {
  client.publish(
    `${base}/status`,
    JSON.stringify({
      online: true,
      rssi: -42,
      ip: "127.0.0.1",
      firmware: "simulator-1.0",
      seq,
    }),
  );
}
client.on("connect", () => {
  console.log("Simulator connected. Do not run alongside the physical board.");
  client.subscribe(`${base}/frame`);
  client.publish(`${base}/hello`, "{}");
  status();
});
client.on("message", (_topic, payload) => {
  const frame = JSON.parse(payload.toString());
  seq = frame.seq;
  if (++seen % 5 === 0)
    console.log(
      `|${frame.line1}|\n|${frame.line2}|  backlight=${frame.backlight} seq=${seq}`,
    );
});
client.on("error", (e) => console.error("Simulator MQTT error:", e.message));
const timer = setInterval(status, 15000);
process.on("SIGINT", () => {
  clearInterval(timer);
  client.publish(`${base}/status`, '{"online":false}', { retain: true }, () =>
    client.end(),
  );
});
