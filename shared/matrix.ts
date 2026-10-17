import { heartbeatPixels } from "./heartbeat.js";
import { glyphs } from "./matrix-font.js";

export const matrixModes = [
  "off",
  "heart",
  "wave",
  "rain",
  "text",
  "custom",
  "sparkles",
  "stars",
  "comet",
  "orbit",
  "ripple",
  "fireworks",
  "equalizer",
  "scanner",
  "spiral",
  "snake",
  "bouncing",
  "invaders",
  "butterfly",
  "smile",
  "kiss",
  "hearts",
  "hourglass",
  "sunrise",
] as const;
export type MatrixMode = (typeof matrixModes)[number];
export const matrixCatalog: { id: MatrixMode; name: string; group: string }[] = [
  { id: "heart", name: "Heartbeat", group: "Love" },
  { id: "hearts", name: "Floating hearts", group: "Love" },
  { id: "kiss", name: "A little kiss", group: "Love" },
  { id: "wave", name: "Sine wave", group: "Nature" },
  { id: "rain", name: "Pixel rain", group: "Nature" },
  { id: "ripple", name: "Water ripples", group: "Nature" },
  { id: "butterfly", name: "Butterfly", group: "Nature" },
  { id: "sunrise", name: "Sunrise", group: "Nature" },
  { id: "sparkles", name: "Sparkles", group: "Space" },
  { id: "stars", name: "Star flight", group: "Space" },
  { id: "comet", name: "Comet trail", group: "Space" },
  { id: "orbit", name: "Orbit", group: "Space" },
  { id: "fireworks", name: "Fireworks", group: "Space" },
  { id: "equalizer", name: "Equalizer", group: "Patterns" },
  { id: "scanner", name: "Scanner", group: "Patterns" },
  { id: "spiral", name: "Spiral", group: "Patterns" },
  { id: "snake", name: "Neon snake", group: "Patterns" },
  { id: "bouncing", name: "Bouncing ball", group: "Play" },
  { id: "invaders", name: "Space invader", group: "Play" },
  { id: "smile", name: "Wink & smile", group: "Play" },
  { id: "hourglass", name: "Hourglass", group: "Play" },
  { id: "text", name: "Scrolling text", group: "Create" },
  { id: "custom", name: "Draw your own", group: "Create" },
  { id: "off", name: "Lights off", group: "Create" },
];
export const presetModes = matrixModes.filter(
  (m) => !["off", "heart", "text", "custom"].includes(m),
);
export type MatrixSettings = {
  mode: MatrixMode;
  speed: number;
  text: string;
  frames: string[];
};
export function encodePixels(p: number[]) {
  let hex = "";
  for (let i = 0; i < 96; i += 4)
    hex += ((p[i] << 3) | (p[i + 1] << 2) | (p[i + 2] << 1) | p[i + 3]).toString(16);
  return hex;
}
export function decodePixels(hex: string) {
  return [...hex].flatMap((c) => [3, 2, 1, 0].map((b) => (parseInt(c, 16) >> b) & 1));
}
export function matrixInterval(s: MatrixSettings) {
  return s.mode === "text" || s.mode === "custom"
    ? 320 - s.speed * 25
    : 160 - s.speed * 12;
}
export function matrixFrameCount(s: MatrixSettings) {
  if (s.mode === "text") return (s.text.length + 3) * 6 + 12;
  if (s.mode === "custom") return s.frames.length;
  return s.mode === "off" ? 1 : 64;
}
export function presetPixels(mode: string, step: number) {
  const p = Array<number>(96).fill(0),
    t = ((step % 64) + 64) % 64,
    angle = (t * Math.PI) / 32;
  const set = (x: number, y: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && x < 12 && y >= 0 && y < 8) p[y * 12 + x] = 1;
  };
  const sprite = (rows: string[], left: number, top: number) =>
    rows.forEach((r, y) =>
      [...r].forEach((c, x) => {
        if (c === "1") set(x + left, y + top);
      }),
    );
  const ring = (cx: number, cy: number, r: number) => {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 12; x++)
        if (Math.abs(Math.hypot(x - cx, y - cy) - r) < 0.55) set(x, y);
  };

  switch (mode) {
    case "wave":
      for (let x = 0; x < 12; x++) set(x, 3.5 + 3 * Math.sin(x * 0.6 + angle * 2));
      break;
    case "rain":
      for (let x = 0; x < 12; x += 2)
        for (let tail = 0; tail < 3; tail++) set(x, (t + x * 7 - tail + 16) % 8);
      break;
    case "sparkles":
      for (let i = 0; i < 9; i++) {
        const phase = (t + i * 7) % 32,
          x = (i * 7 + 2) % 12,
          y = (i * 5 + 1) % 8;
        if (phase < 12) set(x, y);
        if (phase < 4) {
          set(x - 1, y);
          set(x + 1, y);
          set(x, y - 1);
          set(x, y + 1);
        }
      }
      break;
    case "stars":
      for (let i = 0; i < 8; i++) {
        const distance = ((t + i * 8) % 64) / 10;
        const a = (i * Math.PI) / 4;
        set(5.5 + Math.cos(a) * distance, 3.5 + Math.sin(a) * distance * 0.7);
      }
      break;
    case "comet":
      for (let tail = 0; tail < 6; tail++) {
        const a = angle - tail * 0.16;
        set(5.5 + 5 * Math.cos(a), 3.5 + 3 * Math.sin(a));
      }
      break;
    case "orbit":
      set(5, 3);
      set(6, 3);
      set(5, 4);
      set(6, 4);
      for (let i = 0; i < 2; i++)
        set(
          5.5 + 5 * Math.cos(angle + i * Math.PI),
          3.5 + 3 * Math.sin(angle + i * Math.PI),
        );
      break;
    case "ripple":
      ring(5.5, 3.5, (t % 32) / 4);
      ring(5.5, 3.5, ((t + 16) % 32) / 4);
      break;
    case "fireworks":
      {
        const f = t % 32,
          cx = t < 32 ? 3 : 8;
        if (f < 8) {
          set(cx, 7 - f * 0.65);
          set(cx, 8 - f * 0.65);
        } else {
          const r = (f - 8) / 3.5;
          for (let i = 0; i < 8; i++)
            set(
              cx + Math.cos((i * Math.PI) / 4) * r,
              2 + Math.sin((i * Math.PI) / 4) * r,
            );
        }
      }
      break;
    case "equalizer":
      for (let x = 0; x < 12; x += 2) {
        const height = 1 + Math.round(6 * (0.5 + 0.5 * Math.sin(angle * 2 + x * 0.9)));
        for (let y = 0; y < height; y++) {
          set(x, 7 - y);
          set(x + 1, 7 - y);
        }
      }
      break;
    case "scanner":
      {
        const x = Math.round((0.5 - 0.5 * Math.cos(angle)) * 11);
        for (let y = 0; y < 8; y++) {
          set(x, y);
          if (y % 2 === 0) set(x + (t < 32 ? -1 : 1), y);
        }
      }
      break;
    case "spiral":
      for (let i = 0; i < 28; i++) {
        const a = angle + i * 0.35,
          r = i * 0.19;
        set(5.5 + Math.cos(a) * r, 3.5 + Math.sin(a) * r * 0.65);
      }
      break;
    case "snake":
      {
        const path: [number, number][] = [];
        for (let x = 0; x < 12; x++) path.push([x, 0]);
        for (let y = 1; y < 8; y++) path.push([11, y]);
        for (let x = 10; x >= 0; x--) path.push([x, 7]);
        for (let y = 6; y > 0; y--) path.push([0, y]);
        for (let i = 0; i < 10; i++) {
          const [x, y] = path[(Math.floor((t * 36) / 64) - i + 72) % 36];
          set(x, y);
        }
      }
      break;
    case "bouncing":
      {
        const x = Math.round((0.5 - 0.5 * Math.cos(angle)) * 10),
          y = Math.round(Math.abs(Math.sin(angle * 2)) * 6);
        set(x, y);
        set(x + 1, y);
        set(x, y + 1);
        set(x + 1, y + 1);
      }
      break;
    case "invaders":
      sprite(
        t % 16 < 8
          ? [
              "001000100",
              "000101000",
              "001111100",
              "011010110",
              "111111111",
              "101111101",
              "101000101",
              "000101000",
            ]
          : [
              "001000100",
              "000101000",
              "001111100",
              "011010110",
              "111111111",
              "001111100",
              "010000010",
              "100000001",
            ],
        1 + Math.round(Math.sin(angle)),
        0,
      );
      break;
    case "butterfly":
      sprite(
        t % 16 < 8
          ? [
              "10000001",
              "11011011",
              "11111111",
              "01111110",
              "00111100",
              "01111110",
              "11011011",
              "10011001",
            ]
          : [
              "00100100",
              "00111100",
              "00111100",
              "00011000",
              "00011000",
              "00111100",
              "00111100",
              "00100100",
            ],
        2,
        0,
      );
      break;
    case "smile":
      ring(5.5, 3.5, 3.4);
      set(4, 2);
      if (t % 64 < 48) set(7, 2);
      else {
        set(7, 3);
        set(8, 3);
      }
      sprite(["100001", "011110"], 3, 4);
      break;
    case "kiss":
      sprite(
        t % 32 < 16
          ? ["01100110", "11111111", "01111110", "00111100", "00011000"]
          : ["00111100", "01111110", "11111111", "01111110", "00111100"],
        2,
        1,
      );
      break;
    case "hearts":
      for (let i = 0; i < 2; i++)
        sprite(["01010", "11111", "01110", "00100"], i * 6, 7 - ((t + i * 16) % 32) / 4);
      break;
    case "hourglass":
      sprite(
        [
          "11111111",
          "01000010",
          "00100100",
          "00011000",
          "00011000",
          "00100100",
          "01000010",
          "11111111",
        ],
        2,
        0,
      );
      {
        const f = t % 32;
        for (let y = 1; y < 3; y++)
          for (let x = 3 + y; x < 9 - y; x++) if (f < 16 - y * 5) set(x, y);
        for (let y = 5; y < 7; y++)
          for (let x = 8 - y; x < 4 + y; x++) if (f > 28 - y * 4) set(x, y);
        set(5 + (t % 2), 3 + (t % 3));
      }
      break;
    case "sunrise":
      {
        const cy = 7 - Math.sin(angle / 2) ** 2 * 5;
        ring(5.5, cy, 2);
        for (let x = 0; x < 12; x++) set(x, 7);
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI) / 4;
          set(5.5 + Math.cos(a) * 3.5, cy - Math.sin(a) * 3.5);
        }
      }
      break;
  }
  return p;
}
export function matrixFrame(s: MatrixSettings, now: number): string {
  if (s.mode === "heart") return encodePixels(heartbeatPixels(now, s.speed));
  const step = Math.floor(now / matrixInterval(s));
  if (s.mode === "off") return "0".repeat(24);
  if (s.mode === "custom") return s.frames[step % s.frames.length];
  if (s.mode !== "text") return encodePixels(presetPixels(s.mode, step));
  const text = s.text.toUpperCase() + "   ",
    shift = (step % matrixFrameCount(s)) - 12,
    p = Array<number>(96).fill(0);
  for (let x = 0; x < 12; x++) {
    const at = x + shift;
    if (at < 0 || at >= text.length * 6) continue;
    const g = glyphs[text[Math.floor(at / 6)]] ?? glyphs["?"],
      col = at % 6;
    if (col < 5)
      g.forEach((r, y) => {
        if ((r >> (4 - col)) & 1) p[y * 12 + x] = 1;
      });
  }
  return encodePixels(p);
}
export function matrixProgram(s: MatrixSettings) {
  const config = {
    v: 1,
    mode: s.mode,
    speed: s.speed,
    text: s.mode === "text" ? s.text : "",
    frames: s.mode === "custom" ? s.frames : [],
  };
  let revision = 2166136261;
  for (const c of JSON.stringify(config))
    revision = Math.imul(revision ^ c.charCodeAt(0), 16777619) >>> 0;
  return { ...config, revision };
}
