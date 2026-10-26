import { z } from "zod";
import { directions } from "./snake-controls.js";
export { directions };
export const snakeStateSchema = z.object({
  v: z.literal(1),
  id: z.string().uuid(),
  revision: z.number().int().min(0).max(4294967295),
  status: z.enum(["idle", "playing", "paused", "over", "won"]),
  score: z.number().int().min(0).max(93),
  head: z.number().int().min(0).max(95),
  food: z.number().int().min(0).max(95),
  direction: z.number().int().min(0).max(3),
  interval: z.number().int().min(140).max(280),
  matrix: z.string().regex(/^[0-9a-f]{24}$/),
});
export type SnakeState = z.infer<typeof snakeStateSchema>;
export interface SnakeSnapshot {
  id: string;
  controller: string;
  controllerId: string;
  state: SnakeState | null;
  lastSeen: number | null;
  expiresAt: number;
}
export const snakeRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z
    .object({
      action: z.enum(["keepalive", "pause", "resume", "stop"]),
      token: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("turn"),
      token: z.string().uuid(),
      direction: z.enum(directions),
    })
    .strict(),
]);
export type SnakeRequest = z.infer<typeof snakeRequestSchema>;
