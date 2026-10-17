import { loveLine, storyVisible, wallTime } from "../shared/love.js";
import type { Frame, Message, Settings } from "../shared/model.js";
const center = (text: string) =>
  text
    .slice(0, 16)
    .padStart(Math.floor((16 + Math.min(text.length, 16)) / 2))
    .padEnd(16);
export function clockParts(now: number, s: Settings) {
  const date = new Date(now);
  const parts = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    timeZone: s.timezone,
    calendar: s.calendar,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: s.timezone,
    calendar: "gregory",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const l = (key: string) => Number(local.find((p) => p.type === key)?.value);
  const offset = Math.round(
    (Date.UTC(l("year"), l("month") - 1, l("day"), l("hour"), l("minute"), l("second")) -
      Math.floor(now / 1000) * 1000) /
      1000,
  );
  const hour = l("hour");
  const time = `${String(s.hour12 ? hour % 12 || 12 : hour).padStart(2, "0")}:${String(l("minute")).padStart(2, "0")}${s.showSeconds ? ":" + String(l("second")).padStart(2, "0") : ""}${s.hour12 ? (hour < 12 ? " AM" : " PM") : ""}`;
  const order =
    s.dateOrder === "ymd"
      ? ["year", "month", "day"]
      : s.dateOrder === "dmy"
        ? ["day", "month", "year"]
        : ["month", "day", "year"];
  return {
    time,
    date: order.map(get).join("/"),
    offset,
    dateKey: Math.floor((Math.floor(now / 1000) + offset) / 86400),
  };
}
export { encodePixels, decodePixels, matrixFrame } from "../shared/matrix.js";
import { matrixFrame } from "../shared/matrix.js";
export function render(
  s: Settings,
  messages: Message[],
  now = Date.now(),
  seq = 0,
): Frame {
  const c = clockParts(now, s);
  const active = messages.find(
    (m) => !m.cancelled && m.startsAt <= now && m.expiresAt > now,
  );
  let line1 = center(c.time),
    line2 = center(c.date + (s.calendar === "persian" ? " J" : " G"));
  const love = storyVisible(s, now);
  if (love) {
    line1 = center(s.love.title);
    line2 = center(loveLine(s.love.startAt!, now, s.love.format, s.love.timezone));
  }
  if (active) {
    const rows = active.text.match(/.{1,16}/g) ?? [];
    if (active.text.length > 16 && active.text.length <= 32) {
      const boundary = active.text.lastIndexOf(" ", 16);
      if (boundary > 0 && active.text.length - boundary - 1 <= 16) {
        rows[0] = active.text.slice(0, boundary);
        rows[1] = active.text.slice(boundary + 1);
      }
    }
    if (s.messaging.mode === "clock") {
      line1 = center(c.time);
      const text = active.text + "    ";
      const pos = Math.floor((now - active.startsAt) / 300) % text.length;
      line2 =
        active.text.length <= 16
          ? center(active.text)
          : (text + text).slice(pos, pos + 16).padEnd(16);
    } else if (active.text.length <= 32) {
      line1 = center(rows[0] ?? "");
      line2 = center(rows[1] ?? "");
    } else {
      line1 = center("MESSAGE");
      const text = active.text + "    ";
      const pos = Math.floor((now - active.startsAt) / 300) % text.length;
      line2 = (text + text).slice(pos, pos + 16).padEnd(16);
    }
  }
  return {
    v: 1,
    seq,
    epoch: Math.floor(now / 1000),
    ms: Math.floor(now % 1000),
    offset: c.offset,
    line1,
    line2,
    backlight: s.backlight,
    matrix: matrixFrame(s.matrix, now),
    clock: !active && !love,
    clockTop: !!active && s.messaging.mode === "clock",
    heart: s.matrix.mode === "heart",
    heartSpeed: s.matrix.speed,
    love: love && !active,
    loveEnabled: !!s.love.startAt && s.displayMode !== "clock",
    loveSince: s.love.startAt ? Math.floor(Date.parse(s.love.startAt) / 1000) : 0,
    loveTitle: s.love.title,
    loveFormat: [
      "daysClock",
      "seconds",
      "days",
      "weeks",
      "hours",
      "rotate",
      "yearsMonthsDays",
    ].indexOf(s.love.format),
    loveStartWall: s.love.startAt
      ? Math.floor(Date.parse(wallTime(s.love.startAt, s.love.timezone) + "Z") / 1000)
      : 0,
    loveOffset: Math.round(
      (Date.parse(wallTime(new Date(now).toISOString(), s.love.timezone) + "Z") -
        Math.floor(now / 1000) * 1000) /
        1000,
    ),
    hour12: s.hour12,
    seconds: s.showSeconds,
    dateKey: c.dateKey,
  };
}
