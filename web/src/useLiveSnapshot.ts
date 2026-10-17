import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../shared/model";
import { SteadyClock } from "../../shared/steady-clock";
import { render } from "../../server/render";

// Render live time locally rather than replaying buffered SSE frames in bursts.
export function useLiveSnapshot(received: Snapshot | null) {
  const clock = useRef(new SteadyClock());
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!received) {
      clock.current = new SteadyClock();
      setNow(null);
      return;
    }
    clock.current.sample(received.serverTime, performance.now());
    setNow(clock.current.now(performance.now()));
  }, [received]);
  const active = received !== null;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(clock.current.now(performance.now())), 50);
    return () => clearInterval(timer);
  }, [active]);
  if (!received || now === null) return received;
  return {
    ...received,
    serverTime: now,
    frame: render(received.settings, received.messages, now, received.frame.seq),
  };
}
