// Intact, centered hearts: rest -> strong pulse -> softer pulse -> rest.
// Speed 1..10 corresponds to 56..110 beats per minute.
export const heartShapes = [
  ["010010", "111111", "111111", "011110", "001100"],
  ["01100110", "11111111", "11111111", "01111110", "00111100", "00011000"],
  [
    "0011001100",
    "0111111110",
    "1111111111",
    "1111111111",
    "0111111110",
    "0011111100",
    "0001111000",
    "0000110000",
  ],
] as const;

export function heartStage(now: number, speed: number) {
  const period = Math.floor(60000 / (50 + speed * 6));
  const phase = ((now % period) * 1000) / period;
  if (phase < 80) return 1;
  if (phase < 180) return 2;
  if (phase < 250) return 1;
  if (phase < 330) return 0;
  if (phase < 430) return 1;
  return 0;
}

export function heartbeatPixels(now: number, speed: number) {
  const shape = heartShapes[heartStage(now, speed)];
  const pixels = Array<number>(96).fill(0);
  const left = (12 - shape[0].length) / 2;
  const top = Math.floor((8 - shape.length) / 2);
  shape.forEach((row, y) =>
    [...row].forEach((p, x) => {
      pixels[(top + y) * 12 + left + x] = Number(p);
    }),
  );
  return pixels;
}
