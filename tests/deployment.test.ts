import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const available =
  spawnSync("docker", ["compose", "version"], { encoding: "utf8" }).status === 0;
function config(extra: Record<string, string | undefined> = {}) {
  const env = {
    ...process.env,
    ADMIN_PASSWORD: "deployment-test-password",
    MQTT_SERVER_PASSWORD: "deployment-server-password",
    MQTT_DEVICE_PASSWORD: "deployment-device-password",
    APP_ORIGIN: "https://clock.example.com",
    MQTT_DOMAIN: "mqtt.example.com",
    DOKPLOY_NETWORK: "dokploy-network",
    TRAEFIK_HTTPS_ENTRYPOINT: "websecure",
    TRAEFIK_CERT_RESOLVER: "letsencrypt",
    MQTT_ROUTER_NAME: "mystery-box-mqtt",
    ...extra,
  };
  return spawnSync(
    "docker",
    ["compose", "-f", "compose.dokploy.yaml", "config", "--format", "json"],
    { env, encoding: "utf8" },
  );
}
test(
  "Dokploy Compose uses automatic TLS on its existing proxy without public broker ports or certificate files",
  { skip: !available },
  () => {
    const result = config();
    assert.equal(result.status, 0, result.stderr);
    const model = JSON.parse(result.stdout),
      { app, broker } = model.services,
      labels = broker.labels;
    assert.equal(
      labels["traefik.tcp.routers.mystery-box-mqtt.rule"],
      "HostSNI(`mqtt.example.com`)",
    );
    assert.equal(labels["traefik.tcp.routers.mystery-box-mqtt.entrypoints"], "websecure");
    assert.equal(labels["traefik.tcp.routers.mystery-box-mqtt.tls"], "true");
    assert.equal(
      labels["traefik.tcp.routers.mystery-box-mqtt.tls.certresolver"],
      "letsencrypt",
    );
    assert.equal(
      labels["traefik.tcp.routers.mystery-box-mqtt.tls.domains[0].main"],
      "mqtt.example.com",
    );
    assert.equal(
      labels["traefik.tcp.services.mystery-box-mqtt.loadbalancer.server.port"],
      "1883",
    );
    assert.equal(
      labels["traefik.tcp.routers.mystery-box-mqtt.tls.passthrough"],
      undefined,
    );
    assert.equal(labels["traefik.docker.network"], "dokploy-network");
    assert.deepEqual(Object.keys(broker.networks).sort(), ["default", "dokploy-network"]);
    assert.equal(model.networks["dokploy-network"].external, true);
    assert.ok(Object.hasOwn(app.networks, "default"));
    assert.equal(broker.ports, undefined);
    assert.equal(app.ports, undefined);
    assert.ok(!JSON.stringify(model).includes("MQTT_CERT_DIR"));
    assert.ok(!JSON.stringify(broker.volumes).includes("/mosquitto/certs"));
    assert.equal(app.environment.MQTT_URL, "mqtt://broker:1883");
    assert.ok(
      app.volumes.some(
        (v: { source: string; target: string }) =>
          v.source === "app-data" && v.target === "/app/data",
      ),
    );
  },
);
test(
  "Dokploy routing supports customized network, entrypoint and resolver names",
  { skip: !available },
  () => {
    const result = config({
      DOKPLOY_NETWORK: "custom-proxy",
      TRAEFIK_HTTPS_ENTRYPOINT: "secure",
      TRAEFIK_CERT_RESOLVER: "custom-acme",
      MQTT_ROUTER_NAME: "another-box",
    });
    assert.equal(result.status, 0, result.stderr);
    const model = JSON.parse(result.stdout),
      labels = model.services.broker.labels;
    assert.equal(model.networks["dokploy-network"].name, "custom-proxy");
    assert.equal(labels["traefik.docker.network"], "custom-proxy");
    assert.equal(labels["traefik.tcp.routers.another-box.entrypoints"], "secure");
    assert.equal(
      labels["traefik.tcp.routers.another-box.tls.certresolver"],
      "custom-acme",
    );
  },
);
test(
  "Dokploy deployment requires an explicit MQTT hostname",
  { skip: !available },
  () => {
    const result = config({ MQTT_DOMAIN: "" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Set MQTT_DOMAIN/);
  },
);
test("firmware defaults match the automatic TLS endpoint and broker no longer loads certificate files", () => {
  const secrets = readFileSync("firmware/mystery_box/arduino_secrets.h.example", "utf8");
  assert.match(secrets, /#define MQTT_PORT 443/);
  assert.match(secrets, /#define MQTT_TLS 1/);
  const start = readFileSync("broker/start.sh", "utf8");
  assert.ok(!start.includes("certfile"));
  assert.ok(!start.includes("keyfile"));
  assert.match(start, /allow_anonymous false/);
});
