import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot, User } from "../../shared/model";
import { directions, type GameKind } from "../../shared/game-controls";
import { api } from "./api";
type Move = { action: "turn"; direction: (typeof directions)[number] } | { action: "drop" };
export function useGameControls(snapshot: Snapshot, me: User, live: boolean, kind: GameKind) {
  const [token, setToken] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const activeToken = useRef(""), ownedId = useRef(""), mounted = useRef(true), starting = useRef(false);
  const stage = useRef<HTMLDivElement>(null), sending = useRef(false), pending = useRef<Move[]>([]), generation = useRef(0), lastMove = useRef(0);
  const game = snapshot.snake, state = game?.state;
  const own = !!token && game?.id === ownedId.current && game.controllerId === me.id;
  const ready = live && snapshot.broker && snapshot.device.online && snapshot.device.arcade === true && !snapshot.device.errors;
  const stale = !!game && (!game.lastSeen || snapshot.serverTime - game.lastSeen > 2000);
  const canInput = ready && !busy && (!game || (own && !stale && (state?.status === "ready" || state?.status === "playing")));
  const command = useCallback(async (action: string, extra: object = {}) => {
    const current = activeToken.current;
    if (!current && action !== "start") return null;
    if (["pause", "resume", "stop"].includes(action)) { pending.current = []; ++generation.current; }
    if (action === "start") {
      if (starting.current) return null;
      starting.current = true; setBusy(true);
    }
    try {
      setError("");
      const result = await api("games", "POST", { action, ...(action === "start" ? { game: kind } : { token: current }), ...extra });
      if (!mounted.current) {
        if (result.token) void fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", token: result.token }), keepalive: true }).catch(() => {});
        return null;
      }
      if (action === "start") {
        ownedId.current = result.game.id; activeToken.current = result.token; setToken(result.token);
        stage.current?.focus({ preventScroll: true });
        if (window.matchMedia("(max-width: 800px)").matches) stage.current?.scrollIntoView({ block: "start", behavior: "instant" });
      }
      if (action === "stop") { activeToken.current = ""; ownedId.current = ""; setToken(""); }
      return result;
    } catch (e) { if (mounted.current) setError((e as Error).message); return null; }
    finally { if (action === "start") { starting.current = false; if (mounted.current) setBusy(false); } }
  }, [kind]);
  const move = useCallback((input: Move) => {
    if (!canInput) return;
    if (!game) {
      void (async () => {
        const result = await command("start", input.action === "turn" ? { direction: input.direction } : {});
        if (result && input.action === "drop") await command("drop");
      })();
      return;
    }
    if (pending.current.length >= 2) return;
    pending.current.push(input);
    if (sending.current) return;
    sending.current = true;
    void (async () => {
      try {
        while (pending.current.length && activeToken.current && mounted.current) {
          const next = pending.current.shift()!, currentGeneration = generation.current;
          const wait = 60 - (performance.now() - lastMove.current);
          if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
          if (!mounted.current || currentGeneration !== generation.current) continue;
          await command(next.action, next.action === "turn" ? { direction: next.direction } : {});
          lastMove.current = performance.now();
        }
      } finally { sending.current = false; }
    })();
  }, [canInput, game?.id, command]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || target.closest("input, textarea, select, [contenteditable=true]") || event.altKey || event.ctrlKey || event.metaKey) return;
      const index = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].indexOf(event.key);
      if (index >= 0 && canInput) { event.preventDefault(); if (!event.repeat) move({ action: "turn", direction: directions[index] }); }
      if (event.code === "Space" && target.tagName !== "BUTTON" && !event.repeat) {
        if (kind === "tetris" && canInput) { event.preventDefault(); move({ action: "drop" }); }
        else if (kind === "snake" && own && ready && ["playing", "paused"].includes(state?.status ?? "")) { event.preventDefault(); void command(state?.status === "playing" ? "pause" : "resume"); }
      }
      if ((event.key.toLowerCase() === "p" || event.key === "Escape") && own && ready && !event.repeat && ["playing", "paused"].includes(state?.status ?? "")) { event.preventDefault(); void command(state?.status === "playing" ? "pause" : "resume"); }
    };
    window.addEventListener("keydown", handle); return () => window.removeEventListener("keydown", handle);
  }, [canInput, own, ready, state?.status, move, command, kind]);
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void command("keepalive"); }, 2000);
    const pause = () => { pending.current = []; void command("pause"); };
    const hide = () => { if (document.visibilityState === "hidden") pause(); };
    window.addEventListener("blur", pause); document.addEventListener("visibilitychange", hide);
    return () => { clearInterval(timer); window.removeEventListener("blur", pause); document.removeEventListener("visibilitychange", hide); };
  }, [token, command]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; ++generation.current; pending.current = [];
      if (activeToken.current) void fetch("/api/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", token: activeToken.current }), keepalive: true }).catch(() => {});
      activeToken.current = "";
    };
  }, []);
  useEffect(() => {
    if (game && ownedId.current && (game.id !== ownedId.current || game.controllerId !== me.id)) { activeToken.current = ""; ownedId.current = ""; setToken(""); pending.current = []; }
    if (!game && token) { const timer = setTimeout(() => { activeToken.current = ""; ownedId.current = ""; setToken(""); }, 2500); return () => clearTimeout(timer); }
  }, [game?.id, game?.controllerId, me.id, token]);
  return { game, state, own, ready, stale, canInput, command, move, stage, busy, error };
}
