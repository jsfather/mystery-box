import { z } from "zod";
export const printable = z
  .string()
  .regex(
    /^[\x20-\x7e]*$/,
    "Use Latin letters, digits and ASCII punctuation; this LCD has no Persian font.",
  );
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
  .strict();
export type Settings = z.infer<typeof settingsSchema>;
export const defaults: Settings = {
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
    duration: z.number().int().min(5).max(300),
  })
  .strict();
export interface Message {
  id: string;
  text: string;
  startsAt: number;
  expiresAt: number;
  createdAt: number;
  cancelled: boolean;
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
}
