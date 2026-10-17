import { z } from "zod";
export const printable = z
  .string()
  .regex(
    /^[\x20-\x7e]*$/,
    "Use Latin letters, digits and ASCII punctuation; this LCD has no Persian font.",
  );
export const timezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid IANA timezone");
export const loveSchema = z
  .object({
    format: z
      .enum(["daysClock", "seconds", "days", "weeks", "hours", "rotate"])
      .default("daysClock"),
    names: z.string().trim().min(1).max(80).default("You & me"),
    startAt: z.iso
      .datetime({ offset: true })
      .refine((s) => Date.parse(s) >= 0, "Choose a date from 1970 onwards")
      .nullable(),
    timezone: timezoneSchema,
    title: printable.trim().min(1).max(16),
  })
  .strict();
export const settingsSchema = z
  .object({
    timezone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Choose a valid IANA timezone"),
    displayMode: z.enum(["clock", "love", "alternate", "scheduled"]).default("clock"),
    schedule: z
      .object({
        everyMinutes: z.number().int().min(1).max(1440),
        durationSeconds: z.number().int().min(5).max(3600),
      })
      .strict()
      .default({ everyMinutes: 10, durationSeconds: 30 }),
    messaging: z
      .object({
        mode: z.enum(["full", "clock"]),
        defaultDuration: z.number().int().min(5).max(300),
      })
      .strict()
      .default({ mode: "full", defaultDuration: 120 }),
    love: loveSchema.default({
      format: "daysClock",
      startAt: null,
      timezone: "Asia/Tehran",
      title: "YOU & ME <3",
      names: "You & me",
    }),
    calendar: z.enum(["persian", "gregory"]),
    dateOrder: z.enum(["ymd", "dmy", "mdy"]),
    hour12: z.boolean(),
    showSeconds: z.boolean(),
    backlight: z.boolean(),
    matrix: z
      .object({
        mode: z.enum(["off", "heart", "wave", "rain", "text", "custom"]),
        text: printable.max(80),
        speed: z.number().int().min(1).max(10),
        frames: z
          .array(z.string().regex(/^[0-9a-f]{24}$/i))
          .min(1)
          .max(32),
      })
      .strict(),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.schedule.durationSeconds >= s.schedule.everyMinutes * 60)
      ctx.addIssue({
        code: "custom",
        path: ["schedule"],
        message: "Story duration must be shorter than its repeat interval",
      });
    if (s.displayMode !== "clock" && !s.love.startAt)
      ctx.addIssue({
        code: "custom",
        path: ["love", "startAt"],
        message: "Set your special moment before enabling the love timer",
      });
  });
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
  displayMode: "clock",
  schedule: { everyMinutes: 10, durationSeconds: 30 },
  messaging: { mode: "full", defaultDuration: 120 },
  love: {
    format: "daysClock",
    startAt: null,
    timezone: "Asia/Tehran",
    title: "YOU & ME <3",
    names: "You & me",
  },
  timezone: "Asia/Tehran",
  calendar: "persian",
  dateOrder: "ymd",
  hour12: false,
  showSeconds: true,
  backlight: true,
  matrix: {
    mode: "heart",
    text: "HELLO WORLD",
    speed: 5,
    frames: ["000000000000000000000000"],
  },
};
export const messageSchema = z
  .object({
    text: printable
      .min(1)
      .max(160)
      .refine((s) => s.trim().length > 0, "Enter a message"),
    duration: z.number().int().min(5).max(300).optional(),
  })
  .strict();
export interface Message {
  id: string;
  text: string;
  startsAt: number;
  expiresAt: number;
  createdAt: number;
  cancelled: boolean;
  authorId?: string | null;
  authorName?: string;
  cursor?: number;
}
export interface Frame {
  v: 1;
  seq: number;
  epoch: number;
  offset: number;
  line1: string;
  line2: string;
  backlight: boolean;
  matrix: string;
  clock: boolean;
  hour12: boolean;
  seconds: boolean;
  dateKey: number;
  love: boolean;
  loveSince: number;
  loveEnabled: boolean;
  loveTitle: string;
  loveFormat: number;
}
export interface Device {
  online: boolean;
  lastSeen: number | null;
  rssi: number | null;
  ip: string | null;
  firmware: string | null;
  seq: number | null;
}
export interface Snapshot {
  settings: Settings;
  frame: Frame;
  device: Device;
  broker: boolean;
  messages: Message[];
  serverTime: number;
  deviceId: string;
  settingsRevision: number;
  resetRevision: number;
}

export interface User {
  id: string;
  username: string;
  name: string;
  enabled: boolean;
  createdAt: number;
}
export interface ActivityEntry {
  id: number;
  createdAt: number;
  actorId: string | null;
  actorName: string;
  action: string;
  details: Record<string, unknown>;
}
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_-]{3,32}$/, "Username: 3–32 Latin letters, digits, _ or -");
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[^\x00-\x1f\x7f]*$/, "Use a readable display name");
export const passwordSchema = z
  .string()
  .min(16, "Use a password of at least 16 characters")
  .max(256);
export const createUserSchema = z
  .object({ username: usernameSchema, name: nameSchema, password: passwordSchema })
  .strict();
export const updateUserSchema = z
  .object({
    username: usernameSchema.optional(),
    name: nameSchema.optional(),
    enabled: z.boolean().optional(),
    password: passwordSchema.optional(),
    currentPassword: z.string().max(256).optional(),
  })
  .strict();
