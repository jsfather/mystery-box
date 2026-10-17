import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("appearance follows the device until overridden, synchronizes tabs and tolerates blocked storage", () => {
  const listeners: Record<string, (e?: any) => void> = {},
    events: string[] = [];
  let preference: string | null = null,
    blocked = false,
    meta = "";
  const root = { dataset: {} as Record<string, string>, style: { colorScheme: "" } };
  const media = {
    matches: true,
    addEventListener: (name: string, fn: () => void) => {
      listeners["media:" + name] = fn;
    },
  };
  const window: any = { dispatchEvent: (event: any) => events.push(event.detail) };
  const context = {
    window,
    matchMedia: () => media,
    document: {
      documentElement: root,
      querySelector: () => ({
        setAttribute: (_: string, value: string) => {
          meta = value;
        },
      }),
    },
    localStorage: {
      getItem: () => {
        if (blocked) throw Error();
        return preference;
      },
      setItem: (_: string, v: string) => {
        if (blocked) throw Error();
        preference = v;
      },
    },
    CustomEvent: class {
      constructor(
        public type: string,
        public detail: any,
      ) {
        this.detail = detail.detail;
      }
    },
    addEventListener: (name: string, fn: (e: any) => void) => {
      listeners[name] = fn;
    },
  };
  vm.runInNewContext(readFileSync("web/public/theme.js", "utf8"), context);
  assert.equal(window.mbGetTheme(), "system");
  assert.equal(root.dataset.theme, "dark");
  media.matches = false;
  listeners["media:change"]();
  assert.equal(root.dataset.theme, "light");
  window.mbSetTheme("dark");
  assert.equal(preference, "dark");
  assert.equal(root.dataset.theme, "dark");
  listeners["media:change"]();
  assert.equal(root.dataset.theme, "dark");
  listeners.storage({ key: "mb-theme", newValue: "light" });
  assert.equal(root.dataset.theme, "light");
  listeners.storage({ key: "mb-theme", newValue: null });
  assert.equal(window.mbGetTheme(), "system");
  blocked = true;
  window.mbSetTheme("dark");
  assert.equal(root.dataset.theme, "dark");
  assert.equal(meta, "#17221f");
  assert.ok(events.includes("system"));
});

test("semantic text and muted text meet WCAG AA contrast on both themes and chat bubbles", () => {
  const css = readFileSync("web/src/theme.css", "utf8");
  const luminance = (hex: string) => {
    const v = hex
      .slice(1)
      .match(/../g)!
      .map((s) => parseInt(s, 16) / 255)
      .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4));
    return v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
  };
  for (const selector of [":root", ':root[data-theme="dark"]']) {
    const block = css.slice(css.indexOf(selector));
    const declarations = block.slice(0, block.indexOf("}"));
    const variables = Object.fromEntries(
      [...declarations.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    for (const [text, bg] of [
      ["ink", "canvas"],
      ["ink", "surface"],
      ["muted", "surface"],
      ["muted", "surface-soft"],
      ["story-ink", "rose-light"],
      ["green", "accent-soft"],
    ]) {
      const a = luminance(variables[text]),
        b = luminance(variables[bg]);
      assert.ok(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5,
        `${selector}: ${text} on ${bg}`,
      );
    }
  }
});
