import { randomUUID } from "node:crypto";
import {
  directions,
  snakeStateSchema,
  type SnakeRequest,
  type SnakeSnapshot,
} from "../shared/snake.js";

export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class SnakeController {
  private game: SnakeSnapshot | null = null;
  private token = "";
  private sequence = 0;
  private lastCommandAt = 0;
  private lastTurnAt = 0;
  constructor(
    private send: (command: object) => boolean,
    private ready: () => boolean,
    private canStart: () => boolean = () => true,
  ) {}
  snapshot() {
    return this.game;
  }
  private command(action: string, direction?: number) {
    if (!this.game) return false;
    const ok = this.send({
      v: 1,
      id: this.game.id,
      seq: ++this.sequence,
      action,
      ...(direction === undefined ? {} : { direction }),
    });
    return ok;
  }
  release() {
    if (this.game) this.command("stop");
    this.game = null;
    this.token = "";
  }
  request(input: SnakeRequest, user: { id: string; name: string }, now = Date.now()) {
    this.tick(now);
    if (!this.ready())
      throw new GameError(
        503,
        "Connect the box with firmware 1.5.0 or newer before playing.",
      );
    if (input.action === "start") {
      if (!this.canStart())
        throw new GameError(
          409,
          "Resolve the box’s error code before starting a game. See Our journal.",
        );
      if (this.game)
        throw new GameError(
          409,
          `${this.game.controller} is already playing. Stop that game first or wait for its controls to disconnect.`,
        );
      this.token = randomUUID();
      this.sequence = 0;
      this.lastTurnAt = 0;
      this.game = {
        id: randomUUID(),
        controller: user.name,
        controllerId: user.id,
        state: null,
        lastSeen: null,
        expiresAt: now + 8000,
      };
      if (!this.command("start")) {
        this.release();
        throw new GameError(503, "The box connection is unavailable. Try again.");
      }
      this.lastCommandAt = now;
      return { token: this.token, game: this.game };
    }
    if (!this.game || input.token !== this.token || user.id !== this.game.controllerId)
      throw new GameError(
        409,
        "These controls no longer own the game. Start a new game.",
      );
    if (input.action === "turn" && now - this.lastTurnAt < 45)
      throw new GameError(429, "Please wait a moment before the next turn.");
    this.game.expiresAt = now + 8000;
    if (input.action === "keepalive") return { game: this.game };
    if (
      !this.command(
        input.action,
        input.action === "turn" ? directions.indexOf(input.direction) : undefined,
      )
    )
      throw new GameError(503, "The box connection is unavailable. Try again.");
    if (input.action === "turn") this.lastTurnAt = now;
    this.lastCommandAt = now;
    if (input.action === "stop") {
      this.game = null;
      this.token = "";
    }
    return { game: this.game };
  }
  tick(now = Date.now()) {
    if (!this.game) return;
    if (now >= this.game.expiresAt || !this.ready()) {
      this.release();
      return;
    }
    if (now - this.lastCommandAt >= 1000) {
      // Repeat start until acknowledged; commands are never retained or queued offline.
      this.command(this.game.state ? "keepalive" : "start");
      this.lastCommandAt = now;
    }
  }
  receive(value: unknown, now = Date.now()) {
    const result = snakeStateSchema.safeParse(value);
    if (!result.success || !this.game || result.data.id !== this.game.id) return false;
    if (this.game.state && result.data.revision < this.game.state.revision) return false;
    this.game.state = result.data;
    this.game.lastSeen = now;
    return true;
  }
}
