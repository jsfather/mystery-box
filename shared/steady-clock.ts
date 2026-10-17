// Network samples set the time once, then gently correct drift (at most 2%).
// Delayed/bunched samples must never replay or jump the displayed seconds.
export class SteadyClock {
  private time = 0;
  private last = 0;
  private correction = 0;
  private syncedAt: number | null = null;

  sample(serverTime: number, monotonic: number) {
    if (this.syncedAt === null) {
      this.time = serverTime;
      this.last = monotonic;
      this.syncedAt = monotonic;
    } else if (monotonic - this.syncedAt >= 60000) {
      this.now(monotonic);
      this.correction = serverTime - this.time;
      this.syncedAt = monotonic;
    }
  }

  now(monotonic: number) {
    const delta = Math.max(0, monotonic - this.last);
    const adjustment = Math.max(-delta / 50, Math.min(delta / 50, this.correction));
    this.time += delta + adjustment;
    this.correction -= adjustment;
    this.last = monotonic;
    return this.time;
  }
}
