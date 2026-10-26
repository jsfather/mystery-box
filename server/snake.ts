import { randomUUID } from "node:crypto";
import { directions, gameDefaults, gameStateSchema, type GameRequest, type GameSettings, type GameSnapshot } from "../shared/games.js";
import type { GameKind } from "../shared/game-controls.js";
export class GameError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export class GameController {
  private game: GameSnapshot | null = null;
  private token = "";
  private sequence = 0;
  private lastCommandAt = 0;
  private lastTurnAt = 0;
  private firstDirection: number | undefined;
  constructor(private send: (command: object) => boolean, private ready: () => boolean,
    private canStart: () => boolean = () => true, private settings: () => GameSettings = () => gameDefaults) {}
  snapshot() { return this.game; }
  private interval(kind: GameKind) { return kind === "snake" ? this.settings().snake.moveMs : this.settings().tetris.fallMs; }
  private command(action: string, direction?: number) {
    if (!this.game) return false;
    return this.send({ v: 1, id: this.game.id, kind: this.game.kind, seq: ++this.sequence, action,
      interval: this.game.interval, ...(direction === undefined ? {} : { direction }) });
  }
  release() { if (this.game) this.command("stop"); this.game = null; this.token = ""; this.firstDirection = undefined; }
  configure() {
    if (!this.game) return;
    const interval = this.interval(this.game.kind);
    if (this.game.interval === interval) return;
    this.game.interval = interval; this.command("configure");
  }
  request(input: GameRequest, user: { id: string; name: string }, now = Date.now()) {
    this.tick(now);
    if (!this.ready()) throw new GameError(503, "Connect the box with firmware 1.8.0 or newer before playing.");
    if (input.action === "start") {
      if (!this.canStart()) throw new GameError(409, "Resolve the box’s error code before starting a game. See Our journal.");
      if (this.game) throw new GameError(409, `${this.game.controller} already controls a game. End it first or wait for its controls to disconnect.`);
      this.token = randomUUID(); this.sequence = 0; this.lastTurnAt = 0;
      const kind = input.game ?? "snake";
      this.game = { id: randomUUID(), kind, interval: this.interval(kind), controller: user.name, controllerId: user.id, state: null, lastSeen: null, expiresAt: now + 8000 };
      this.firstDirection = input.direction === undefined ? undefined : directions.indexOf(input.direction);
      if (!this.command("start", this.firstDirection)) { this.release(); throw new GameError(503, "The box connection is unavailable. Try again."); }
      this.lastCommandAt = now; return { token: this.token, game: this.game };
    }
    if (!this.game || input.token !== this.token || user.id !== this.game.controllerId) throw new GameError(409, "These controls no longer own the game. Start a new game.");
    if (input.action === "drop" && this.game.kind !== "tetris") throw new GameError(400, "Hard drop is only available in Tetris.");
    if (["turn", "drop"].includes(input.action) && now - this.lastTurnAt < 45) throw new GameError(429, "Please wait a moment before the next move.");
    this.game.expiresAt = now + 8000;
    if (input.action === "keepalive") return { game: this.game };
    if (!this.command(input.action, input.action === "turn" ? directions.indexOf(input.direction) : undefined)) throw new GameError(503, "The box connection is unavailable. Try again.");
    if (["turn", "drop"].includes(input.action)) this.lastTurnAt = now;
    this.lastCommandAt = now;
    if (input.action === "stop") { this.game = null; this.token = ""; this.firstDirection = undefined; }
    return { game: this.game };
  }
  tick(now = Date.now()) {
    if (!this.game) return;
    if (now >= this.game.expiresAt || !this.ready()) { this.release(); return; }
    if (now - this.lastCommandAt >= 1000) {
      const action = !this.game.state ? "start" : this.game.state.interval !== this.game.interval ? "configure" : "keepalive";
      this.command(action, action === "start" ? this.firstDirection : undefined); this.lastCommandAt = now;
    }
  }
  receive(value: unknown, now = Date.now()) {
    const result = gameStateSchema.safeParse(value);
    if (!result.success || !this.game || result.data.id !== this.game.id || result.data.kind !== this.game.kind) return false;
    if (this.game.state && result.data.revision < this.game.state.revision) return false;
    this.game.state = result.data; this.game.lastSeen = now; return true;
  }
}
export { GameController as SnakeController };
