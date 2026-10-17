import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
test("PWA manifest has standalone navigation and all iPhone/Android icons exist", () => {
  const manifest = JSON.parse(readFileSync("web/public/manifest.webmanifest", "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(
    manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable"),
  );
  for (const icon of manifest.icons) assert.ok(existsSync("web/public" + icon.src));
  assert.ok(existsSync("web/public/icons/apple-touch-icon.png"));
  const html = readFileSync("web/index.html", "utf8");
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /manifest.webmanifest/);
});
test("service worker bypasses all private API traffic and serves a safe offline page for failed navigation", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  let intercepted = false,
    response: Promise<unknown> | undefined;
  const context = {
    self: {
      location: { origin: "https://our-world.test" },
      addEventListener: (type: string, fn: (event: any) => void) => (handlers[type] = fn),
    },
    URL,
    caches: {
      match: async (key: string) =>
        key === "/offline.html" ? "offline-screen" : undefined,
    },
    fetch: async () => {
      throw new Error("offline");
    },
  };
  const source = readFileSync("web/public/sw.js", "utf8")
    .replace("__PRECACHE_ASSETS__", JSON.stringify(["/offline.html", "/assets/main.js"]))
    .replace("__BUILD_ID__", "test");
  vm.runInNewContext(source, context);
  for (const path of [
    "/api/state",
    "/api/events",
    "/api/messages",
    "/api/login",
    "/api/activity",
    "/api/users",
  ])
    handlers.fetch({
      request: { url: "https://our-world.test" + path, method: "GET", mode: "cors" },
      respondWith: () => {
        intercepted = true;
      },
    });
  assert.equal(intercepted, false);
  handlers.fetch({
    request: { url: "https://our-world.test/", method: "GET", mode: "navigate" },
    respondWith: (value: Promise<unknown>) => (response = value),
  });
  assert.equal(await response, "offline-screen");
});
test("production service worker is versioned and every precached build asset exists", () => {
  if (!existsSync("dist/sw.js")) return;
  const source = readFileSync("dist/sw.js", "utf8");
  assert.ok(!source.includes("__PRECACHE_ASSETS__"));
  assert.ok(!source.includes("__BUILD_ID__"));
  const match = source.match(/const SHELL = (\[[^;]+\]);/)!;
  assert.ok(match);
  for (const path of JSON.parse(match[1]))
    assert.ok(existsSync("dist" + path), `Missing precached asset ${path}`);
});
