import { z } from "zod";
import { directions, gameKinds, type GameKind } from "./game-controls.js";
export { directions };
export const gameDefaults = { snake: { moveMs: 350 }, tetris: { fallMs: 900 } };
export const gameSettingsSchema = z.object({
  snake: z.object({ moveMs: z.number().int().min(200).max(800).multipleOf(50).default(350) }).strict().default(gameDefaults.snake),
  tetris: z.object({ fallMs: z.number().int().min(300).max(1500).multipleOf(100).default(900) }).strict().default(gameDefaults.tetris),
}).strict().default(gameDefaults);
export type GameSettings = z.infer<typeof gameSettingsSchema>;
export const gameStateSchema = z.object({
  v: z.literal(1), id: z.string().uuid(), kind: z.enum(gameKinds).default("snake"), revision: z.number().int().min(0).max(4294967295),
  status: z.enum(["idle", "ready", "playing", "paused", "over", "won"]),
  score: z.number().int().min(0).max(4294967295), lines: z.number().int().min(0).max(4294967295).default(0),
  head: z.number().int().min(0).max(95).default(0), food: z.number().int().min(0).max(95).default(0),
  direction: z.number().int().min(0).max(3).default(1), interval: z.number().int().min(140).max(1500),
  matrix: z.string().regex(/^[0-9a-f]{24}$/), active: z.string().regex(/^[0-9a-f]{24}$/).optional(),
}).superRefine((state, ctx) => {
  if (state.kind === "snake" && state.score > 93) ctx.addIssue({ code: "custom", message: "Invalid Snake score" });
});
export type GameState = z.infer<typeof gameStateSchema>;
export interface GameSnapshot {
  id: string; kind: GameKind; interval: number; controller: string; controllerId: string;
  state: GameState | null; lastSeen: number | null; expiresAt: number;
}
export const gameRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), game: z.enum(gameKinds).optional(), direction: z.enum(directions).optional() }).strict(),
  z.object({ action: z.enum(["keepalive", "pause", "resume", "stop", "drop"]), token: z.string().uuid() }).strict(),
  z.object({ action: z.literal("turn"), token: z.string().uuid(), direction: z.enum(directions) }).strict(),
]);
export type GameRequest = z.infer<typeof gameRequestSchema>;
