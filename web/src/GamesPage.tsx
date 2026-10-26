import { useRef, useState } from "react";
import {
  ArrowUp,
  ArrowRight,
  ArrowDown,
  ArrowLeft,
  Play,
  Pause,
  Square,
  RotateCcw,
  Gamepad2,
  ChevronsDown,
  SlidersHorizontal,
} from "lucide-react";
import type { Snapshot, User } from "../../shared/model";
import {
  directions,
  gameKinds,
  gameNames,
  type GameKind,
} from "../../shared/game-controls";
import { decodePixels } from "../../shared/matrix";
import { useGameControls } from "./useGameControls";
import type { SaveSettings } from "./api";
import "./snake.css";
import "./games.css";

export function GamesPage({
  snapshot,
  me,
  live,
  save,
}: {
  snapshot: Snapshot;
  me: User;
  live: boolean;
  save: SaveSettings;
}) {
  const [selected, setSelected] = useState<GameKind>("snake");
  const kind = snapshot.snake?.kind ?? selected;
  return (
    <div className="games-hub">
      <div className="game-picker" role="group" aria-label="Choose a game">
        {gameKinds.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            disabled={!!snapshot.snake && kind !== value}
            onClick={() => setSelected(value)}
          >
            <span>{value === "snake" ? "01" : "02"}</span>
            <strong>{gameNames[value]}</strong>
            <small>
              {value === "snake"
                ? "Wrap around. Grow a little longer."
                : "Stack, rotate, clear a line."}
            </small>
          </button>
        ))}
      </div>
      {snapshot.snake && (
        <p className="input-note">
          End the current round before switching games. One controller, one shared matrix.
        </p>
      )}
      <div className="games-layout">
        <GameSession key={kind} kind={kind} snapshot={snapshot} me={me} live={live} />
        <GameSettings
          key={kind + "-settings"}
          kind={kind}
          snapshot={snapshot}
          save={save}
        />
      </div>
    </div>
  );
}
function GameSession({
  kind,
  snapshot,
  me,
  live,
}: {
  kind: GameKind;
  snapshot: Snapshot;
  me: User;
  live: boolean;
}) {
  const { game, state, own, ready, stale, canInput, command, move, stage, busy, error } =
    useGameControls(snapshot, me, live, kind);
  const isSnake = kind === "snake";
  const idle = Array<number>(96).fill(0);
  for (const at of isSnake ? [38, 39, 40, 22] : [5, 16, 17, 18]) idle[at] = 1;
  const pixels = state ? decodePixels(state.matrix) : idle;
  const active = state?.active ? decodePixels(state.active) : Array<number>(96).fill(0);
  const interval =
    state?.interval ??
    (isSnake
      ? snapshot.settings.games.snake.moveMs
      : snapshot.settings.games.tetris.fallMs);
  const status = snapshot.device.errors
    ? "Check the box’s error code in Our journal."
    : !ready
      ? "Connect the box with the latest game firmware."
      : !game
        ? "Press an arrow to start"
        : stale
          ? "Waiting for the box…"
          : state?.status === "ready"
            ? "Ready · your first arrow starts the round"
            : state?.status === "over"
              ? "Game over · ready for another round?"
              : state?.status === "won"
                ? "Every pixel is yours. You won!"
                : state?.status === "paused"
                  ? "Paused · resume when you’re ready"
                  : `${game.controller} is playing`;
  const icons = [isSnake ? ArrowUp : RotateCcw, ArrowRight, ArrowDown, ArrowLeft];
  const names = isSnake
    ? ["Move up", "Move right", "Move down", "Move left"]
    : ["Rotate piece", "Move piece right", "Soft drop", "Move piece left"];
  const activate = (event: React.PointerEvent<HTMLButtonElement>, action: () => void) => {
    if (event.pointerType !== "mouse" || event.button === 0) {
      event.preventDefault();
      action();
    }
  };
  return (
    <section className="card snake-card game-session">
      <div className="card-title">
        <div>
          <span className="eyebrow">A LITTLE PLAYTIME</span>
          <h2>{gameNames[kind]}</h2>
        </div>
        <Gamepad2 size={25} />
      </div>
      <p className="input-note snake-rules">
        {isSnake
          ? "Catch the snacks and avoid your tail. Every edge wraps to the opposite side."
          : "Fit the falling pieces together. Fill a row to clear it; the round ends when the stack reaches the top."}
      </p>
      <div className="snake-score">
        <span>
          Score <strong>{state?.score ?? 0}</strong>
        </span>
        <span>
          {isSnake ? "Pace" : "Lines"}
          <strong>
            {isSnake ? `${(1000 / interval).toFixed(1)} / s` : (state?.lines ?? 0)}
          </strong>
        </span>
      </div>
      <div className="snake-arena">
        <div
          className="snake-stage"
          tabIndex={0}
          ref={stage}
          aria-label={`${gameNames[kind]} game board. Use arrow keys to play.`}
        >
          <div
            className="snake-grid"
            role="img"
            aria-label={`${gameNames[kind]} board. ${state?.status ?? "ready"}. Score ${state?.score ?? 0}.`}
          >
            {pixels.map((on, i) => (
              <i
                key={i}
                className={`${on ? "on" : ""} ${isSnake && on && i === state?.head ? "snake-head" : ""} ${isSnake && on && i === state?.food && state?.status !== "won" ? "snake-food" : ""} ${!isSnake && active[i] ? "tetris-active" : ""}`}
              />
            ))}
          </div>
        </div>
        <div className="snake-controls">
          <p className="snake-status" role="status">
            {status}
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="snake-actions">
            {own && (
              <>
                {(state?.status === "playing" || state?.status === "paused") && (
                  <button
                    type="button"
                    className="primary"
                    disabled={!ready || stale}
                    onClick={() =>
                      command(state?.status === "playing" ? "pause" : "resume")
                    }
                  >
                    {state?.status === "playing" ? (
                      <Pause size={16} />
                    ) : (
                      <Play size={16} />
                    )}
                    {state?.status === "playing" ? "Pause" : "Resume"}
                  </button>
                )}
                {(state?.status === "over" || state?.status === "won") && (
                  <button
                    type="button"
                    className="primary"
                    disabled={!ready || busy}
                    onClick={async () => {
                      const stopped = await command("stop");
                      if (stopped) await command("start");
                    }}
                  >
                    <RotateCcw size={16} />
                    New round
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => command("stop")}
                >
                  <Square size={15} />
                  End round
                </button>
              </>
            )}
            {!game && (
              <button
                type="button"
                className="secondary"
                disabled={!ready || busy}
                onClick={() => command("start")}
              >
                <Gamepad2 size={16} />
                {busy ? "Preparing…" : "Prepare board"}
              </button>
            )}
          </div>
          <div
            className="snake-pad"
            role="group"
            aria-label={`${gameNames[kind]} touch controls`}
          >
            {directions.map((direction, index) => {
              const Icon = icons[index];
              const action = () => move({ action: "turn", direction });
              return (
                <button
                  type="button"
                  key={direction}
                  className={`snake-${direction}`}
                  aria-label={names[index]}
                  disabled={!canInput}
                  onPointerDown={(event) => activate(event, action)}
                  onClick={(event) => {
                    if (event.detail === 0) action();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      action();
                    }
                  }}
                >
                  <Icon size={25} />
                </button>
              );
            })}
          </div>
          {!isSnake && (
            <button
              type="button"
              className="secondary hard-drop"
              disabled={!canInput}
              onPointerDown={(event) => activate(event, () => move({ action: "drop" }))}
              onClick={(event) => {
                if (event.detail === 0) move({ action: "drop" });
              }}
            >
              <ChevronsDown size={18} />
              Hard drop
            </button>
          )}
        </div>
      </div>
      <p className="quiet-note">
        {isSnake
          ? "Arrows steer. Space or P pauses. The board waits until your first direction."
          : "← → move · ↑ rotate · ↓ soft drop · Space hard drop · P pauses."}{" "}
        Touch controls work on your phone.
      </p>
      <p className="input-note">
        The preview follows your box. Switching away or losing the connection pauses play;
        leaving Games ends your round and restores the LED animation.
      </p>
    </section>
  );
}
function GameSettings({
  kind,
  snapshot,
  save,
}: {
  kind: GameKind;
  snapshot: Snapshot;
  save: SaveSettings;
}) {
  const isSnake = kind === "snake",
    saved = isSnake
      ? snapshot.settings.games.snake.moveMs
      : snapshot.settings.games.tetris.fallMs;
  const [interval, setInterval] = useState(saved),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const baseline = useRef(snapshot.settingsRevision);
  const max = isSnake ? 800 : 1500,
    sum = isSnake ? 1000 : 1800;
  return (
    <form
      className="card form-card game-settings"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const games = {
            ...snapshot.settings.games,
            [kind]: isSnake ? { moveMs: interval } : { fallMs: interval },
          };
          baseline.current = await save(
            { ...snapshot.settings, games },
            baseline.current,
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="card-title">
        <div>
          <span className="eyebrow">YOUR PACE</span>
          <h2>{gameNames[kind]} settings</h2>
        </div>
        <SlidersHorizontal size={20} />
      </div>
      <label htmlFor={`speed-${kind}`}>
        {isSnake ? "Movement speed" : "Falling speed"}
      </label>
      <output>
        {isSnake
          ? `${(1000 / interval).toFixed(1)} moves / second`
          : `${(interval / 1000).toFixed(1)} seconds / step`}
      </output>
      <input
        id={`speed-${kind}`}
        type="range"
        min={isSnake ? 200 : 300}
        max={max}
        step={isSnake ? 50 : 100}
        value={sum - interval}
        aria-valuetext={`${interval} milliseconds per step`}
        onChange={(event) => setInterval(sum - Number(event.target.value))}
      />
      <div className="game-speed-labels">
        <span>Slower</span>
        <span>Faster</span>
      </div>
      <p className="input-note">
        Saved separately for each game. Apply it to the current round and keep it for next
        time.
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save game settings"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="game-rules">
        <strong>{isSnake ? "Snake rules" : "Mini Tetris rules"}</strong>
        <p>
          {isSnake
            ? "All four edges wrap. Only your own tail can end the round. Fill the matrix to win."
            : "Seven classic pieces. Full rows disappear. Move, rotate and drop on the 12 × 8 board."}
        </p>
      </div>
    </form>
  );
}
