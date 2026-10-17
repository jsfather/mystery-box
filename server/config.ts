import { z } from "zod";
const schema = z.object({
  ADMIN_PASSWORD: z.string().min(16, "ADMIN_PASSWORD must be at least 16 characters"),
  ADMIN_USERNAME: z
    .string()
    .regex(/^[a-z0-9_-]{3,32}$/)
    .default("husband"),
  ADMIN_NAME: z.string().trim().min(1).max(60).default("My love"),
  PARTNER_USERNAME: z
    .string()
    .regex(/^[a-z0-9_-]{3,32}$/)
    .default("wife"),
  PARTNER_NAME: z.string().trim().min(1).max(60).default("My person"),
  PARTNER_PASSWORD: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(16).max(256).optional(),
  ),
  MQTT_PASSWORD: z
    .string()
    .min(16, "Set MQTT_PASSWORD to the MQTT server account password"),
  DEVICE_ID: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,32}$/)
    .default("uno-r4"),
  MQTT_URL: z.string().url().default("mqtt://127.0.0.1:1883"),
  MQTT_USERNAME: z.string().default("server"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default("./data"),
  APP_ORIGIN: z.string().url().optional(),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  NODE_ENV: z.string().default("development"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"),
    );
  const c = parsed.data;
  if (c.ADMIN_USERNAME === c.PARTNER_USERNAME)
    throw new Error("Choose different usernames for the two accounts");
  if (!/^mqtts?:\/\//.test(c.MQTT_URL))
    throw new Error("MQTT_URL must use mqtt:// or mqtts://");
  if (
    c.NODE_ENV === "production" &&
    (!c.APP_ORIGIN?.startsWith("https://") || c.COOKIE_SECURE !== "true")
  )
    throw new Error("Production requires HTTPS APP_ORIGIN and COOKIE_SECURE=true");
  return c;
}
