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
// Compact 5x7 font: each value is a row, bit 4 is the leftmost pixel.
const glyphs: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 18, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [30, 1, 1, 14, 1, 1, 30],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 16, 30, 1, 1, 30],
  "6": [14, 16, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  ".": [0, 0, 0, 0, 0, 0, 4],
  ":": [0, 4, 0, 0, 4, 0, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  _: [0, 0, 0, 0, 0, 0, 31],
  ",": [0, 0, 0, 0, 0, 4, 8],
  "'": [4, 4, 0, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "#": [10, 31, 10, 10, 31, 10, 0],
  "%": [17, 2, 4, 8, 17, 0, 0],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "*": [0, 21, 14, 31, 14, 21, 0],
  "<": [2, 4, 8, 16, 8, 4, 2],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "@": [14, 17, 23, 21, 23, 16, 14],
  "[": [14, 8, 8, 8, 8, 8, 14],
  "]": [14, 2, 2, 2, 2, 2, 14],
  "\\": [16, 8, 8, 4, 2, 2, 1],
  "^": [4, 10, 17, 0, 0, 0, 0],
  "`": [8, 4, 0, 0, 0, 0, 0],
  "{": [2, 4, 4, 8, 4, 4, 2],
  "}": [8, 4, 4, 2, 4, 4, 8],
  "|": [4, 4, 4, 4, 4, 4, 4],
  "~": [0, 0, 8, 21, 2, 0, 0],
  ";": [0, 4, 0, 0, 4, 8, 0],
  $: [4, 15, 20, 14, 5, 30, 4],
};
export function encodePixels(pixels: number[]): string {
  let hex = "";
  for (let i = 0; i < 96; i += 4)
    hex += (
      (pixels[i] << 3) |
      (pixels[i + 1] << 2) |
      (pixels[i + 2] << 1) |
      pixels[i + 3]
    ).toString(16);
  return hex;
}
export function decodePixels(hex: string): number[] {
  return [...hex].flatMap((c) => [3, 2, 1, 0].map((b) => (parseInt(c, 16) >> b) & 1));
}
export function matrixFrame(s: Settings["matrix"], now: number): string {
  const step = Math.floor(now / Math.max(200, 600 - s.speed * 45));
  if (s.mode === "off") return "0".repeat(24);
  if (s.mode === "custom") return s.frames[step % s.frames.length];
  const p = Array<number>(96).fill(0);
  const set = (x: number, y: number) => {
    if (x >= 0 && x < 12 && y >= 0 && y < 8) p[y * 12 + x] = 1;
  };
  if (s.mode === "heart") {
    const rows = [
      "000000000000",
      "001100011000",
      "011110111100",
      "011111111100",
      "001111111000",
      "000111110000",
      "000011100000",
      "000001000000",
    ];
    rows.forEach((r, y) =>
      [...r].forEach((c, x) => {
        if (c === "1" && (step % 6 < 4 || y > 2)) set(x, y);
      }),
    );
  } else if (s.mode === "wave") {
    for (let x = 0; x < 12; x++) {
      set(x, Math.round(3.5 + 3 * Math.sin((x + step) * 0.6)));
    }
  } else if (s.mode === "rain") {
    for (let x = 0; x < 12; x += 2) {
      const y = (step + x * 7) % 11;
      set(x, y);
      set(x, y - 1);
      set(x, y - 2);
    }
  } else {
    const text = s.text.toUpperCase() + "   ";
    const shift = (step % (text.length * 6 + 12)) - 12;
    for (let x = 0; x < 12; x++) {
      const at = x + shift;
      if (at < 0 || at >= text.length * 6) continue;
      const g = glyphs[text[Math.floor(at / 6)]] ?? glyphs["?"];
      const col = at % 6;
      if (col < 5)
        g.forEach((r, y) => {
          if ((r >> (4 - col)) & 1) set(x, y);
        });
    }
  }
  return encodePixels(p);
}
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
    offset: c.offset,
    line1,
    line2,
    backlight: s.backlight,
    matrix: matrixFrame(s.matrix, now),
    clock: !active && !love,
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
