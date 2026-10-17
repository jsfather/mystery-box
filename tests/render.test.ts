import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, messageSchema, settingsSchema } from "../shared/model.js";
import {
  clockParts,
  render,
  matrixFrame,
  encodePixels,
  decodePixels,
} from "../server/render.js";
const s = () => structuredClone(defaults);
test("Jalali Nowruz conversion and Tehran half-hour offset", () => {
  const parts = clockParts(Date.parse("2025-03-21T00:00:00Z"), s());
  assert.equal(parts.date, "1404/01/01");
  assert.equal(parts.time, "03:30:00");
  assert.equal(parts.offset, 12600);
});
test("Gregorian date crosses midnight in selected timezone", () => {
  const settings = { ...s(), calendar: "gregory" as const };
  const parts = clockParts(Date.parse("2026-01-01T22:00:00Z"), settings);
  assert.equal(parts.date, "2026/01/02");
  assert.equal(parts.time, "01:30:00");
});
test("12 hour midnight and noon with no seconds", () => {
  const settings = {
    ...s(),
    timezone: "UTC",
    hour12: true,
    showSeconds: false,
  };
  assert.equal(clockParts(Date.parse("2026-01-01T00:00:00Z"), settings).time, "12:00 AM");
  assert.equal(clockParts(Date.parse("2026-01-01T12:00:00Z"), settings).time, "12:00 PM");
});
test("DST transition calculates offset from instant, not server timezone", () => {
  const settings = { ...s(), timezone: "America/New_York" };
  assert.equal(clockParts(Date.parse("2026-03-08T06:59:59Z"), settings).offset, -18000);
  assert.equal(clockParts(Date.parse("2026-03-08T07:00:00Z"), settings).offset, -14400);
});
test("date order and 16 character boundaries", () => {
  const settings = { ...s(), dateOrder: "dmy" as const };
  const now = Date.parse("2025-03-21T00:00:00Z");
  assert.equal(clockParts(now, settings).date, "01/01/1404");
  for (const hour12 of [true, false])
    for (const showSeconds of [true, false]) {
      const f = render({ ...settings, hour12, showSeconds }, [], now);
      assert.equal(f.line1.length, 16);
      assert.equal(f.line2.length, 16);
      assert.ok(Buffer.byteLength(JSON.stringify(f)) < 768);
    }
});
test("expired or cancelled messages never render; long messages scroll", () => {
  const now = 100000;
  const m = {
    id: "a",
    text: "Hello",
    startsAt: now - 1000,
    expiresAt: now + 1000,
    createdAt: now - 1000,
    cancelled: false,
  };
  assert.equal(render(s(), [m], now).clock, false);
  assert.equal(render(s(), [m], m.expiresAt).clock, true);
  assert.equal(render(s(), [{ ...m, cancelled: true }], now).clock, true);
  const long = {
    ...m,
    text: "Longer than thirty two characters so this should scroll across the LCD.",
  };
  assert.notEqual(render(s(), [long], now).line2, render(s(), [long], now + 300).line2);
});
test("packed matrix maps first and last pixels MSB first", () => {
  const p = Array(96).fill(0);
  p[0] = 1;
  p[95] = 1;
  const hex = encodePixels(p);
  assert.equal(hex, "800000000000000000000001");
  assert.deepEqual(decodePixels(hex), p);
});
test("all matrix modes produce exactly 96 binary pixels", () => {
  for (const mode of ["off", "heart", "wave", "rain", "text", "custom"] as const)
    for (const now of [0, 150, 1000, 1000000]) {
      const hex = matrixFrame({ ...s().matrix, mode }, now);
      assert.match(hex, /^[0-9a-f]{24}$/i);
      assert.equal(decodePixels(hex).length, 96);
    }
});
test("reject unsupported characters, oversized frames and invalid zones", () => {
  assert.equal(messageSchema.safeParse({ text: "سلام", duration: 15 }).success, false);
  assert.equal(
    messageSchema.safeParse({ text: "Hi\nWorld", duration: 15 }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...s(), timezone: "Not/AZone" }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({ ...s(), matrix: { ...s().matrix, frames: [] } }).success,
    false,
  );
});
