import { useCallback, useEffect, useRef, useState } from "react";
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
} from "lucide-react";
import type { Snapshot, User } from "../../shared/model";
import { directions } from "../../shared/snake-controls";
import { decodePixels } from "../../shared/matrix";
import { api } from "./api";
import "./snake.css";

type Direction = (typeof directions)[number];
export function SnakePage({
  snapshot,
  me,
  live,
}: {
  snapshot: Snapshot;
  me: User;
  live: boolean;
}) {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const activeToken = useRef(""),
    ownedGameId = useRef(""),
    controlGeneration = useRef(0);
  const sending = useRef(false),
    pending = useRef<Direction[]>([]),
    lastTurn = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const game = snapshot.snake,
    state = game?.state;
  const own = !!token && game?.id === ownedGameId.current && game?.controllerId === me.id;
  const ready =
    live &&
    snapshot.broker &&
    snapshot.device.online &&
    snapshot.device.snake === true &&
    !snapshot.device.errors;
  const stale = !!game && (!game.lastSeen || snapshot.serverTime - game.lastSeen > 2000);
  const playing = own && ready && !stale && state?.status === "playing";
  const command = useCallback(async (action: string, extra = {}) => {
    const current = activeToken.current;
    if (!current && action !== "start") return;
    if (["pause", "resume", "stop"].includes(action)) {
      pending.current = [];
      controlGeneration.current++;
    }
    try {
      setError("");
      const result = await api("snake", "POST", {
        action,
        ...(action === "start" ? {} : { token: current }),
        ...extra,
      });
      if (action === "start") {
        ownedGameId.current = result.game.id;
        activeToken.current = result.token;
        setToken(result.token);
        stage.current?.focus({ preventScroll: true });
        if (window.matchMedia("(max-width: 800px)").matches)
          stage.current?.scrollIntoView({ block: "start", behavior: "instant" });
      }
      if (action === "stop") {
        activeToken.current = "";
        setToken("");
        pending.current = [];
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  const steer = useCallback(
    (direction: Direction) => {
      if (!playing || pending.current.length >= 2) return;
      // Serialize bounded turns so HTTP response timing cannot reorder key presses.
      pending.current.push(direction);
      if (sending.current) return;
      sending.current = true;
      void (async () => {
        try {
          while (pending.current.length && activeToken.current) {
            const next = pending.current.shift()!;
            const generation = controlGeneration.current;
            const wait = 60 - (performance.now() - lastTurn.current);
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
            if (generation !== controlGeneration.current) continue;
            await command("turn", { direction: next });
            lastTurn.current = performance.now();
          }
        } finally {
          sending.current = false;
        }
      })();
    },
    [playing, command],
  );
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("input, textarea, select, [contenteditable=true]") ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const index = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].indexOf(
        event.key,
      );
      if (index >= 0 && playing) {
        event.preventDefault();
        if (!event.repeat) steer(directions[index]);
      }
      if (
        event.code === "Space" &&
        own &&
        ready &&
        !event.repeat &&
        target.tagName !== "BUTTON"
      ) {
        event.preventDefault();
        void command(state?.status === "playing" ? "pause" : "resume");
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [steer, playing, own, ready, state?.status, command]);
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void command("keepalive");
    }, 2000);
    const hide = () => {
      if (document.visibilityState === "hidden") {
        pending.current = [];
        void command("pause");
      }
    };
    const blur = () => {
      pending.current = [];
      void command("pause");
    };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("blur", blur);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("blur", blur);
    };
  }, [token, command]);
  // Leaving this page releases ownership; the board also has its own loss-of-control timeout.
  useEffect(
    () => () => {
      if (activeToken.current) {
        void fetch("/api/snake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stop", token: activeToken.current }),
          keepalive: true,
        }).catch(() => {});
        activeToken.current = "";
        pending.current = [];
      }
    },
    [],
  );
  useEffect(() => {
    if (
      game &&
      (game.controllerId !== me.id ||
        (ownedGameId.current && game.id !== ownedGameId.current))
    ) {
      activeToken.current = "";
      setToken("");
      pending.current = [];
    }
    if (!game && snapshot.serverTime > 0 && token) {
      // A start response may arrive before the SSE snapshot. Allow that snapshot to catch up.
      const timer = setTimeout(() => {
        activeToken.current = "";
        setToken("");
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [game?.id, game?.controllerId, me.id, token]);
  const pixels = decodePixels(state?.matrix ?? "0".repeat(24));
  const status = snapshot.device.errors
    ? "The box has an error. Check Our journal."
    : !ready
      ? "Connect your box to play"
      : !game
        ? "Ready for a little adventure"
        : stale
          ? "Waiting for the box…"
          : state?.status === "over"
            ? "Game over · another round?"
            : state?.status === "won"
              ? "You filled the whole box!"
              : state?.status === "paused"
                ? "Paused · take your time"
                : `${game.controller} is playing`;
  const buttons = [ArrowUp, ArrowRight, ArrowDown, ArrowLeft];
  return (
    <section className="card snake-card">
      <div className="card-title">
        <div>
          <span className="eyebrow">A LITTLE PLAYTIME</span>
          <h2>Snake on your box</h2>
        </div>
        <Gamepad2 size={26} />
      </div>
      <p className="input-note snake-rules">
        Catch the glowing snacks. Avoid the walls and your tail. Each snack makes you a
        little faster.
      </p>
      <div className="snake-score">
        <span>
          Score <strong>{state?.score ?? 0}</strong>
        </span>
        <span>
          Pace <strong>{(1000 / (state?.interval ?? 280)).toFixed(1)} / s</strong>
        </span>
      </div>
      <div className="snake-arena">
        <div
          className="snake-stage"
          tabIndex={0}
          ref={stage}
          aria-label="Snake game. Use arrow keys to steer and space to pause."
        >
          <div
            className="snake-grid"
            role="img"
            aria-label={`Live board view. Score ${state?.score ?? 0}. ${state?.status ?? "idle"}`}
          >
            {pixels.map((on, i) => (
              <i
                key={i}
                className={`${on ? "on" : ""} ${on && i === state?.head ? "snake-head" : ""} ${on && i === state?.food && state?.status !== "won" ? "snake-food" : ""}`}
              />
            ))}
          </div>
        </div>
        <div className="snake-controls">
          <p className="snake-status" role="status">
            {status}
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="snake-actions">
            {!game && (
              <button
                className="primary"
                disabled={!ready || busy}
                onClick={async () => {
                  setBusy(true);
                  await command("start");
                  setBusy(false);
                }}
              >
                <Play size={17} />
                {busy ? "Starting…" : "Start game"}
              </button>
            )}
            {own && (
              <>
                {(state?.status === "playing" || state?.status === "paused") && (
                  <button
                    className="primary"
                    disabled={!ready || stale}
                    onClick={() =>
                      command(state?.status === "playing" ? "pause" : "resume")
                    }
                  >
                    {state?.status === "playing" ? (
                      <Pause size={17} />
                    ) : (
                      <Play size={17} />
                    )}
                    {state?.status === "playing" ? "Pause" : "Resume"}
                  </button>
                )}
                {(state?.status === "over" || state?.status === "won") && (
                  <button
                    className="primary"
                    disabled={!ready || busy}
                    onClick={async () => {
                      setBusy(true);
                      await command("stop");
                      await command("start");
                      setBusy(false);
                    }}
                  >
                    <RotateCcw size={17} />
                    Play again
                  </button>
                )}
                <button className="secondary" onClick={() => command("stop")}>
                  <Square size={16} />
                  End game
                </button>
              </>
            )}
          </div>
          <div className="snake-pad" role="group" aria-label="Touch direction controls">
            {directions.map((direction, index) => {
              const Icon = buttons[index];
              return (
                <button
                  key={direction}
                  className={`snake-${direction}`}
                  aria-label={`Move ${direction}`}
                  disabled={!playing}
                  onPointerDown={(e) => {
                    if (e.pointerType !== "mouse" || e.button === 0) {
                      e.preventDefault();
                      steer(direction);
                    }
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) steer(direction);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      steer(direction);
                    }
                  }}
                >
                  <Icon size={26} />
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="quiet-note">
        Arrow keys on your laptop. Direction buttons on your phone. Space pauses. One
        player controls the box at a time; everyone can watch. Leaving this page ends your
        game and restores the LED animation.
      </p>
      <p className="input-note">
        The preview follows the real board. Controls pause automatically when the page
        loses focus or the connection drops.{" "}
        {snapshot.device.snake !== true &&
          "Firmware 1.5.0 and the matching server/broker deployment are required."}
      </p>
    </section>
  );
}
