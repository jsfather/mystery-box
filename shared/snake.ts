// Compatibility exports for existing integrations; games share a single controller lease.
export {
  directions,
  gameStateSchema as snakeStateSchema,
  gameRequestSchema as snakeRequestSchema,
} from "./games.js";
export type {
  GameState as SnakeState,
  GameSnapshot as SnakeSnapshot,
  GameRequest as SnakeRequest,
} from "./games.js";
