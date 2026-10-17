import { defineConfig } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3000" } },
  plugins: [
    {
      name: "private-pwa-shell",
      writeBundle(_options, bundle) {
        const assets = [
          "/offline.html",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/icons/maskable-512.png",
          "/icons/apple-touch-icon.png",
          "/manifest.webmanifest",
          ...Object.keys(bundle)
            .filter((name) => /\.(js|css|woff2?)$/.test(name))
            .map((name) => "/" + name),
        ];
        const path = resolve("dist/sw.js"),
          template = readFileSync(path, "utf8");
        const hash = createHash("sha256").update(JSON.stringify(assets)).update(template);
        for (const asset of assets)
          hash.update(readFileSync(resolve("dist", asset.slice(1))));
        const id = hash.digest("hex").slice(0, 16);
        writeFileSync(
          path,
          template
            .replace("__BUILD_ID__", id)
            .replace("__PRECACHE_ASSETS__", JSON.stringify(assets)),
        );
      },
    },
  ],
});
