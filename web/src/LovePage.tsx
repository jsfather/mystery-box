import { useRef, useState } from "react";
import { Heart, ArrowUpRight, Check, LoaderCircle, Sparkles } from "lucide-react";
import type { Snapshot, Settings } from "../../shared/model";
import { elapsedLove, momentFromWall, wallTime } from "../../shared/love";
import type { SaveSettings } from "./api";
export function LoveHero({
  snapshot,
  onSetup,
}: {
  snapshot: Snapshot;
  onSetup?: () => void;
}) {
  const { love } = snapshot.settings;
  const elapsed = love.startAt ? elapsedLove(love.startAt, snapshot.serverTime) : null;
  const since = love.startAt
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "long",
        timeZone: love.timezone,
        calendar: snapshot.settings.calendar,
      }).format(new Date(love.startAt))
    : null;
  return (
    <section className="love-hero">
      <div className="love-orbit" aria-hidden="true">
        <Heart fill="currentColor" />
        <i />
        <i />
      </div>
      <div className="love-heading">
        <span className="eyebrow">OUR LITTLE FOREVER</span>
        <h2>{elapsed ? "Every second, us." : "Every story has a beginning."}</h2>
        <p>
          {since
            ? `Since ${since} · ${love.names}`
            : "Save the moment your story began. We’ll count every second after."}
        </p>
      </div>
      {elapsed ? (
        <>
          <div
            className="love-counter"
            aria-label={`${elapsed.days} days, ${elapsed.hours} hours, ${elapsed.minutes} minutes, ${elapsed.seconds} seconds together`}
          >
            {(
              [
                ["days", elapsed.days],
                ["hours", elapsed.hours],
                ["minutes", elapsed.minutes],
                ["seconds", elapsed.seconds],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <strong>{String(value).padStart(2, "0")}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="love-footer">
            <span>
              <Heart size={12} />
              {elapsed.total.toLocaleString()} little seconds together
            </span>
            {onSetup && (
              <button onClick={onSetup}>
                Our special moment <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </>
      ) : (
        <button className="primary rose" onClick={onSetup}>
          <Heart size={15} />
          Set our special moment
        </button>
      )}
    </section>
  );
}
export function LovePage({ snapshot, save }: { snapshot: Snapshot; save: SaveSettings }) {
  const initial = snapshot.settings;
  const [love, setLove] = useState(initial.love),
    [mode, setMode] = useState(initial.displayMode),
    [wall, setWall] = useState(
      initial.love.startAt ? wallTime(initial.love.startAt, initial.love.timezone) : "",
    ),
    [occurrence, setOccurrence] = useState<"earlier" | "later">("earlier"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const baseline = useRef(snapshot.settingsRevision);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const startAt = momentFromWall(wall, love.timezone, occurrence);
      if (Date.parse(startAt) > snapshot.serverTime)
        throw new Error("Choose a starting moment in the past");
      baseline.current = await save(
        { ...snapshot.settings, displayMode: mode, love: { ...love, startAt } },
        baseline.current,
      );
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <LoveHero
        snapshot={snapshot}
        onSetup={() => document.getElementById("love-start")?.focus()}
      />
      <div className="detail-grid love-details">
        <form className="card form-card" onSubmit={submit}>
          <div className="card-title">
            <div>
              <span className="eyebrow">THE SECOND THAT CHANGED EVERYTHING</span>
              <h2>Where our story began</h2>
            </div>
            <Heart size={20} />
          </div>
          <label htmlFor="love-names">Our names</label>
          <input
            id="love-names"
            maxLength={80}
            value={love.names}
            onChange={(e) => setLove({ ...love, names: e.target.value })}
            placeholder="You & me"
            required
          />
          <label htmlFor="love-start">Our starting date & time · including seconds</label>
          <input
            id="love-start"
            type="datetime-local"
            step="1"
            required
            value={wall}
            onChange={(e) => setWall(e.target.value)}
          />
          <p className="input-note">
            Enter a Gregorian date in the timezone below. Saved once as an exact instant;
            changing the clock’s timezone won’t change how long you’ve been together.
          </p>
          <label htmlFor="love-zone">Timezone where it happened</label>
          <input
            id="love-zone"
            list="love-zones"
            required
            value={love.timezone}
            onChange={(e) => setLove({ ...love, timezone: e.target.value })}
          />
          <datalist id="love-zones">
            {["UTC", ...Intl.supportedValuesOf("timeZone")].map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
          <details className="dst-details">
            <summary>If the clocks changed that night</summary>
            <p>
              Some local times happen twice when daylight saving ends. Choose which
              occurrence you mean.
            </p>
            <select
              aria-label="Repeated time occurrence"
              value={occurrence}
              onChange={(e) => setOccurrence(e.target.value as "earlier" | "later")}
            >
              <option value="earlier">First occurrence (earlier)</option>
              <option value="later">Second occurrence (later)</option>
            </select>
          </details>
          <label htmlFor="love-title">LCD dedication</label>
          <input
            id="love-title"
            maxLength={16}
            required
            value={love.title}
            onChange={(e) => setLove({ ...love, title: e.target.value })}
          />
          <p className="input-note">
            Up to 16 Latin characters on the physical screen. Your names above can be in
            Persian.
          </p>
          <label htmlFor="display-mode">What should our box show?</label>
          <select
            id="display-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as Settings["displayMode"])}
          >
            <option value="clock">Date & time</option>
            <option value="love">Our time together</option>
            <option value="alternate">A little of both · switch every 12 seconds</option>
          </select>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="saved-note" role="status">
              <Check size={15} />
              Our moment is saved.
            </p>
          )}
          <button className="primary rose" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <Heart size={16} />}Save
            our story
          </button>
          {error.includes("another device") && (
            <button
              type="button"
              className="secondary"
              onClick={() => window.location.reload()}
            >
              Reload current settings
            </button>
          )}
        </form>
        <section className="card story-note">
          <Sparkles size={28} />
          <span className="eyebrow">A LITTLE LOVE, ON YOUR DESK</span>
          <h2>Not a day goes uncounted.</h2>
          <p>
            Your display counts full days, hours, minutes and seconds from that one
            special moment. A day here is exactly 24 hours, so the seconds stay true
            through timezones and daylight saving.
          </p>
          <div className="love-lcd-sample">
            <span>{love.title || "YOU & ME <3"}</span>
            <strong>1234d 05:06:07</strong>
          </div>
          <p>
            Messages take the stage when you send them, then your story returns. If Wi-Fi
            drops, the updated firmware keeps your love counter running from the board’s
            RTC.
          </p>
          <div className="story-signature">
            <Heart size={16} fill="currentColor" />
            For all the seconds still to come.
          </div>
        </section>
      </div>
    </>
  );
}
