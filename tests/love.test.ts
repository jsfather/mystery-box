import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, settingsSchema } from "../shared/model.js";
import { elapsedLove, momentFromWall, wallTime } from "../shared/love.js";
import { render } from "../server/render.js";
test("love counter counts the precise second across days and leap day", () => {
  const start = "2024-02-28T23:59:59Z",
    now = Date.parse("2024-03-01T01:02:03Z");
  assert.deepEqual(elapsedLove(start, now), {
    total: 90124,
    days: 1,
    hours: 1,
    minutes: 2,
    seconds: 4,
  });
  assert.equal(elapsedLove(start, Date.parse(start) + 999).total, 0);
  assert.equal(elapsedLove(start, Date.parse(start) + 1000).total, 1);
});
test("selected timezone resolves the exact instant including seconds", () => {
  assert.equal(
    momentFromWall("2024-01-02T03:04:05", "Asia/Tehran"),
    "2024-01-01T23:34:05.000Z",
  );
  assert.equal(wallTime("2024-01-01T23:34:05Z", "Asia/Tehran"), "2024-01-02T03:04:05");
  assert.equal(
    momentFromWall("2024-01-02T03:04", "Asia/Tehran"),
    "2024-01-01T23:34:00.000Z",
  );
});
test("DST gaps reject and repeated times explicitly resolve earlier/later", () => {
  assert.throws(
    () => momentFromWall("2026-03-08T02:30:00", "America/New_York"),
    /does not exist/,
  );
  assert.equal(
    momentFromWall("2026-11-01T01:30:01", "America/New_York", "earlier"),
    "2026-11-01T05:30:01.000Z",
  );
  assert.equal(
    momentFromWall("2026-11-01T01:30:01", "America/New_York", "later"),
    "2026-11-01T06:30:01.000Z",
  );
  assert.throws(() => momentFromWall("2026-02-30T12:00:00", "UTC"), /valid date/);
});
test("love LCD fits both rows and messages take precedence; timezone does not change elapsed time", () => {
  const now = Date.parse("2025-01-02T01:02:03Z");
  const settings = {
    ...structuredClone(defaults),
    displayMode: "love" as const,
    love: { ...defaults.love, startAt: "2025-01-01T00:00:00Z" },
  };
  const frame = render(settings, [], now);
  assert.equal(frame.line2.trim(), "1d 01:02:03");
  assert.equal(frame.line1.length, 16);
  assert.equal(frame.love, true);
  assert.equal(frame.clock, false);
  assert.equal(frame.loveEnabled, true);
  assert.equal(
    render({ ...settings, timezone: "Pacific/Auckland" }, [], now).line2,
    frame.line2,
  );
  const message = {
    id: "note",
    text: "I love you",
    startsAt: now - 100,
    expiresAt: now + 5000,
    createdAt: now,
    cancelled: false,
  };
  const messageFrame = render(settings, [message], now);
  assert.equal(messageFrame.love, false);
  assert.equal(messageFrame.loveEnabled, true);
  assert.match(messageFrame.line1, /I love you/);
  assert.equal(render(settings, [message], now + 5000).love, true);
  assert.ok(Buffer.byteLength(JSON.stringify(frame)) < 768);
});
test("alternating display switches every twelve seconds and requires a starting moment", () => {
  const settings = {
    ...structuredClone(defaults),
    displayMode: "alternate" as const,
    love: { ...defaults.love, startAt: "2024-01-01T00:00:00Z" },
  };
  const start = Math.floor(Date.parse("2025-01-01T00:00:00Z") / 24000) * 24000;
  assert.equal(render(settings, [], start).clock, true);
  assert.equal(render(settings, [], start + 12000).love, true);
  assert.equal(render(settings, [], start + 24000).clock, true);
  assert.equal(
    settingsSchema.safeParse({ ...defaults, displayMode: "love" }).success,
    false,
  );
});
