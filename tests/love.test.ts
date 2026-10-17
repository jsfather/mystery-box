import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, settingsSchema } from "../shared/model.js";
import {
  elapsedLove,
  momentFromWall,
  wallTime,
  calendarLove,
  loveLine,
  rotatingLoveFormats,
} from "../shared/love.js";
import { render } from "../server/render.js";
test("rotation includes every counter including calendar years/months/days", () => {
  const start = "2023-10-01T00:18:00+03:30";
  const now = Math.floor(Date.parse("2026-10-17T00:18:00+03:30") / 60000) * 60000;
  assert.equal(rotatingLoveFormats.length, 6);
  for (let i = 0; i < 6; ++i) {
    const at = now + i * 10000;
    assert.equal(
      loveLine(start, at, "rotate", "Asia/Tehran"),
      loveLine(start, at, rotatingLoveFormats[i], "Asia/Tehran"),
    );
  }
  assert.equal(loveLine(start, now + 10000, "rotate", "Asia/Tehran"), "3y 0m 16d");
});
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

test("scheduled story starts on its interval and ends at the exact configured second", () => {
  const settings = {
    ...structuredClone(defaults),
    displayMode: "scheduled" as const,
    love: { ...defaults.love, startAt: "2020-01-01T00:00:00Z" },
  };
  const boundary = Date.parse("2026-10-17T12:00:00Z");
  assert.equal(render(settings, [], boundary - 1).love, false);
  assert.equal(render(settings, [], boundary).love, true);
  assert.equal(render(settings, [], boundary + 29999).love, true);
  assert.equal(render(settings, [], boundary + 30000).love, false);
  assert.equal(render(settings, [], boundary + 600000).love, true);
  const message = {
    id: "override",
    text: "Hello",
    startsAt: boundary,
    expiresAt: boundary + 5000,
    createdAt: boundary,
    cancelled: false,
  };
  assert.equal(render(settings, [message], boundary).love, false);
  assert.equal(render(settings, [message], boundary + 5000).love, true);
});
test("all story formats fit the character display, including long relationships", () => {
  const settings = {
    ...structuredClone(defaults),
    displayMode: "love" as const,
    love: { ...defaults.love, startAt: "1970-01-01T00:00:00Z" },
  };
  for (const format of [
    "daysClock",
    "seconds",
    "days",
    "weeks",
    "hours",
    "rotate",
    "yearsMonthsDays",
  ] as const) {
    for (const now of [
      Date.parse("1970-01-01T00:00:01Z"),
      Date.parse("2099-12-31T23:59:59Z"),
    ]) {
      const frame = render({ ...settings, love: { ...settings.love, format } }, [], now);
      assert.equal(frame.line2.length, 16);
      assert.ok(Buffer.byteLength(JSON.stringify(frame)) < 768);
    }
  }
  const now = Date.parse("1970-01-15T01:02:03Z");
  assert.equal(
    render(
      { ...settings, love: { ...settings.love, format: "seconds" } },
      [],
      now,
    ).line2.trim(),
    "1213323 seconds",
  );
  assert.equal(
    render(
      { ...settings, love: { ...settings.love, format: "weeks" } },
      [],
      now,
    ).line2.trim(),
    "2w 0d 01:02",
  );
});

test("calendar story counts complete months and days at the original wall-clock second", () => {
  const start = "2023-10-01T00:18:00+03:30";
  assert.deepEqual(
    calendarLove(start, Date.parse("2026-10-17T00:18:00+03:30"), "Asia/Tehran"),
    { years: 3, months: 0, days: 16 },
  );
  assert.deepEqual(
    calendarLove(start, Date.parse("2024-10-01T00:17:59+03:30"), "Asia/Tehran"),
    { years: 0, months: 11, days: 29 },
  );
  assert.equal(
    loveLine(
      start,
      Date.parse("2026-10-17T00:18:00+03:30"),
      "yearsMonthsDays",
      "Asia/Tehran",
    ),
    "3y 0m 16d",
  );
  const settings = settingsSchema.parse({
    ...defaults,
    displayMode: "love",
    love: { ...defaults.love, startAt: start, format: "yearsMonthsDays" },
  });
  const frame = render(settings, [], Date.parse("2026-10-17T00:18:00+03:30"));
  assert.equal(frame.line2.trim(), "3y 0m 16d");
  assert.equal(frame.loveFormat, 6);
  assert.equal(frame.loveOffset, 12600);
  assert.equal(frame.loveStartWall, Date.parse("2023-10-01T00:18:00Z") / 1000);
});

test("calendar story clamps leap days and month ends, and uses story timezone across DST", () => {
  for (const [start, now, expected] of [
    ["2024-01-31T12:00:00Z", "2024-02-29T11:59:59Z", { years: 0, months: 0, days: 28 }],
    ["2024-01-31T12:00:00Z", "2024-02-29T12:00:00Z", { years: 0, months: 1, days: 0 }],
    ["2024-02-29T12:00:00Z", "2025-02-28T12:00:00Z", { years: 1, months: 0, days: 0 }],
    ["2024-01-31T12:00:00Z", "2024-03-30T12:00:00Z", { years: 0, months: 1, days: 30 }],
    ["2024-01-31T12:00:00Z", "2024-03-31T12:00:00Z", { years: 0, months: 2, days: 0 }],
    ["2024-01-31T12:00:00Z", "2023-01-01T12:00:00Z", { years: 0, months: 0, days: 0 }],
  ] as const)
    assert.deepEqual(calendarLove(start, Date.parse(now)), expected);
  const start = "2024-03-09T12:00:00-05:00",
    now = Date.parse("2024-03-10T12:00:00-04:00");
  assert.deepEqual(calendarLove(start, now, "America/New_York"), {
    years: 0,
    months: 0,
    days: 1,
  });
  assert.deepEqual(calendarLove(start, now, "UTC"), { years: 0, months: 0, days: 0 });
});
