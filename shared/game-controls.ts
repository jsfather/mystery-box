export const directions = ["up", "right", "down", "left"] as const;
export const gameKinds = ["snake", "tetris"] as const;
export type GameKind = (typeof gameKinds)[number];
export const gameNames: Record<GameKind, string> = { snake: "Snake", tetris: "Mini Tetris" };
