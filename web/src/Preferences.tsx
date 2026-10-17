import { useEffect, useRef, useState } from "react";
import { Settings2, TriangleAlert } from "lucide-react";
import type { Snapshot } from "../../shared/model";
import { api, type SaveSettings } from "./api";
declare global {
  interface Window {
    mbSetTheme: (value: string) => void;
    mbGetTheme: () => string;
  }
}
export function ThemeSelect() {
  const [theme, setTheme] = useState(() => window.mbGetTheme?.() ?? "system");
  useEffect(() => {
    const update = () => setTheme(window.mbGetTheme());
    window.addEventListener("mb-theme", update);
    return () => window.removeEventListener("mb-theme", update);
  }, []);
  return (
    <select
      aria-label="Application theme"
      className="theme-select"
      value={theme}
      onChange={(e) => window.mbSetTheme(e.target.value)}
    >
      <option value="system">Device theme</option>
      <option value="light">Light theme</option>
      <option value="dark">Dark theme</option>
    </select>
  );
}
export function Preferences({
  snapshot,
  save,
  notice,
}: {
  snapshot: Snapshot;
  save: SaveSettings;
  notice: (s: string) => void;
}) {
  const [messaging, setMessaging] = useState(snapshot.settings.messaging);
  const baseline = useRef(snapshot.settingsRevision);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [eraseHistory, setEraseHistory] = useState(false);
  return (
    <div className="detail-grid preferences">
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            baseline.current = await save(
              { ...snapshot.settings, messaging },
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
            <span className="eyebrow">OUR EVERYDAY DETAILS</span>
            <h2>Messages & appearance</h2>
          </div>
          <Settings2 size={20} />
        </div>
        <label htmlFor="message-layout">When a message arrives</label>
        <select
          id="message-layout"
          value={messaging.mode}
          onChange={(e) =>
            setMessaging({ ...messaging, mode: e.target.value as "full" | "clock" })
          }
        >
          <option value="full">Message fills both LCD rows</option>
          <option value="clock">Time on top · message on the bottom</option>
        </select>
        <p className="input-note">
          Long messages scroll. The clock stays live in the top row when you choose the
          second layout.
        </p>
        <label htmlFor="default-duration">Default time on the box</label>
        <select
          id="default-duration"
          value={messaging.defaultDuration}
          onChange={(e) =>
            setMessaging({ ...messaging, defaultDuration: +e.target.value })
          }
        >
          {[...new Set([15, 30, 60, 120, 180, 300, messaging.defaultDuration])]
            .sort((a, b) => a - b)
            .map((n) => (
              <option key={n} value={n}>
                {n < 60 ? `${n} seconds` : `${n / 60} ${n === 60 ? "minute" : "minutes"}`}
              </option>
            ))}
        </select>
        <p className="input-note">
          Two minutes by default. Each message is saved in your conversation and queued
          for the box. You can choose a different duration when sending.
        </p>
        <button className="primary" disabled={busy}>
          Save message settings
        </button>
        <div className="appearance-setting">
          <label>Application appearance</label>
          <ThemeSelect />
          <p className="input-note">
            Device theme follows your phone or computer automatically. This preference
            belongs to this browser.
          </p>
        </div>
      </form>
      <section className="card form-card reset-card">
        <div className="card-title">
          <div>
            <span className="eyebrow">A FRESH START</span>
            <h2>Factory reset</h2>
          </div>
          <TriangleAlert size={20} />
        </div>
        <p>
          Restore the clock, display, story and message settings to their defaults and
          cancel queued messages. Both accounts, passwords and connection credentials stay
          in place.
        </p>
        <p className="input-note">
          The server cannot erase Wi-Fi credentials stored in the Arduino sketch.
        </p>
        {!confirming ? (
          <button className="secondary" onClick={() => setConfirming(true)}>
            Reset our box…
          </button>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("factory-reset", "POST", {
                  password,
                  confirmation,
                  eraseHistory,
                });
                setPassword("");
                notice("Box restored to factory settings");
                window.location.reload();
              } catch (e) {
                setPassword("");
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="reset-choice">
              <input
                type="checkbox"
                checked={eraseHistory}
                onChange={(e) => setEraseHistory(e.target.checked)}
              />{" "}
              Also permanently erase our conversation and journal
            </label>
            <p className="input-note">
              {eraseHistory
                ? "All saved messages and journal entries will be deleted. A new reset entry is kept. This cannot be undone."
                : "Saved messages and journal entries will be kept."}
            </p>
            <label htmlFor="reset-password">Your password</label>
            <input
              id="reset-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <label htmlFor="reset-confirmation">Type RESET to confirm</label>
            <input
              id="reset-confirmation"
              required
              pattern="RESET"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <div className="reset-actions">
              <button
                className="primary danger"
                disabled={busy || confirmation !== "RESET"}
              >
                Restore factory settings
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                  setConfirmation("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
