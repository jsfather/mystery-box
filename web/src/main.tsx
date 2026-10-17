import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  LayoutDashboard,
  Clock3,
  MessageSquare,
  Grid3X3,
  Radio,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  Wifi,
  WifiOff,
  Sun,
  Moon,
  Send,
  Check,
  X,
  Plus,
  Trash2,
  LogOut,
  LoaderCircle,
  LockKeyhole,
  ChevronRight,
  Activity,
  Cable,
  Info,
  Play,
  Copy,
  RotateCcw,
} from "lucide-react";
import type { Settings, Snapshot } from "../../shared/model";
import { decodePixels, encodePixels } from "../../server/render";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./style.css";
type Page = "overview" | "clock" | "messages" | "matrix" | "device";
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/" + path, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const pageInfo: Record<Page, [string, string]> = {
  overview: ["Control room", "A little hardware. A world of possibilities."],
  clock: ["Time & display", "Your time, your calendar, your corner of the world."],
  messages: ["Messages", "Send a little something to the real world."],
  matrix: ["LED studio", "Twelve by eight pixels. Make every one count."],
  device: ["Connection", "Everything between your server and your desk."],
};
function App() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [password, setPassword] = useState(""),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [live, setLive] = useState(false),
    [page, setPage] = useState<Page>("overview"),
    [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    api("session")
      .then((s) => setAuth(s.authenticated))
      .catch(() => {
        setAuth(false);
        setLoginError("Cannot reach server. Please try again.");
      });
  }, []);
  useEffect(() => {
    if (!auth) return;
    let stopped = false;
    api("state")
      .then((s) => {
        if (!stopped) setSnapshot(s);
      })
      .catch(() => {});
    const stream = new EventSource("/api/events");
    stream.onmessage = (e) => {
      setSnapshot(JSON.parse(e.data));
      setLive(true);
    };
    stream.onerror = () => {
      setLive(false);
      api("session")
        .then((s) => {
          if (!stopped && !s.authenticated) {
            setAuth(false);
            setSnapshot(null);
          }
        })
        .catch(() => {});
    };
    return () => {
      stopped = true;
      stream.close();
      setLive(false);
    };
  }, [auth]);
  function notice(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }
  async function save(s: Settings) {
    try {
      await api("settings", "PUT", s);
      notice("Settings saved · updating your device");
    } catch (e) {
      notice((e as Error).message);
      throw e;
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      await api("login", "POST", { password });
      setPassword("");
      setAuth(true);
    } catch (e) {
      setLoginError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth === null)
    return (
      <div className="loading">
        <Box size={32} />
        <p>Opening the control room…</p>
      </div>
    );
  if (!auth)
    return (
      <div className="login">
        <div className="login-art">
          <Brand />
          <div>
            <span className="eyebrow">SMALL BOARD. BIG POSSIBILITIES.</span>
            <h1>
              Give your desk
              <br />a little life<span>.</span>
            </h1>
            <p>
              A clock, a message, a little light.
              <br />
              Your Mystery Box is ready for its next idea.
            </p>
            <div className="art-matrix">
              {decodePixels("0003187bc7fc3f81f00e0040").map((p, i) => (
                <i key={i} className={p ? "on" : ""} />
              ))}
            </div>
          </div>
          <small>ARDUINO UNO R4 WIFI · CONNECTED BY DESIGN</small>
        </div>
        <form onSubmit={login} className="login-form">
          <span className="mini-icon">
            <LockKeyhole size={22} />
          </span>
          <h2>Welcome to your control room</h2>
          <p>Sign in to make a little magic happen.</p>
          <label htmlFor="password">Admin password</label>
          <input
            id="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
          {loginError && (
            <p role="alert" className="error">
              {loginError}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <>
                Open control room <ArrowRight size={17} />
              </>
            )}
          </button>
          <small>Your server. Your hardware. Your space.</small>
        </form>
      </div>
    );
  const s = snapshot;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="workspace">
          <span className="workspace-icon">
            <Box size={20} />
          </span>
          <div>
            <strong>My workspace</strong>
            <small>Personal hardware lab</small>
          </div>
          <span className="tiny-pill">01</span>
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {(
            [
              ["overview", LayoutDashboard, "Overview"],
              ["clock", Clock3, "Time & display"],
              ["messages", MessageSquare, "Messages"],
              ["matrix", Grid3X3, "LED studio"],
              ["device", Radio, "Connection"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={page === id ? "active" : ""}
            >
              <Icon size={18} />
              {label}
              {page === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="board-note">
            <span className="status-dot" />
            <strong>Made for the real world</strong>
            <p>
              UNO R4 WiFi + 1602 LCD
              <br />
              One small, connected box.
            </p>
            <Cable size={31} />
          </div>
          <button
            className="logout"
            onClick={() =>
              api("logout", "POST")
                .then(() => {
                  setAuth(false);
                  setSnapshot(null);
                })
                .catch((e) => notice(e.message))
            }
          >
            <LogOut size={16} /> Sign out
          </button>
          <small className="version">MYSTERY BOX / V1.0</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{pageInfo[page][0]}</strong>
          </div>
          <div className="top-status">
            <span className={"status-dot " + (live ? "" : "muted")} />
            {live ? "Live connection" : "Reconnecting…"}
            <span className="avatar">M</span>
            <button
              className="top-logout"
              aria-label="Sign out"
              onClick={() =>
                api("logout", "POST")
                  .then(() => {
                    setAuth(false);
                    setSnapshot(null);
                  })
                  .catch((e) => notice(e.message))
              }
            >
              <LogOut size={15} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR DESK, CONNECTED</div>
              <h1>
                {pageInfo[page][0]}
                <span>.</span>
              </h1>
              <p>{pageInfo[page][1]}</p>
            </div>
            <span className={"device-pill " + (s?.device.online ? "online" : "")}>
              <span className="status-dot" />
              {s?.device.online ? "Device online" : "Device offline"}
            </span>
          </div>
          {!s ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              <p>Connecting to your server…</p>
            </div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="stats">
                    <Stat
                      icon={<Clock3 />}
                      label="LOCAL TIME"
                      value={new Intl.DateTimeFormat("en-GB", {
                        timeZone: s.settings.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hourCycle: "h23",
                      }).format(s.serverTime)}
                      sub={s.settings.timezone.replaceAll("_", " ").replace("/", " / ")}
                    />
                    <Stat
                      icon={<Activity />}
                      label="DEVICE STATUS"
                      value={s.device.online ? "Connected" : "Waiting for device"}
                      sub={
                        s.device.online
                          ? `${s.device.rssi ?? "—"} dBm · MQTT stream active`
                          : "Your preview is live on the server"
                      }
                      status={s.device.online}
                    />
                    <Stat
                      icon={<MessageSquare />}
                      label="MESSAGE QUEUE"
                      value={String(
                        s.messages.filter(
                          (m) => !m.cancelled && m.expiresAt > s.serverTime,
                        ).length,
                      ).padStart(2, "0")}
                      sub="Ready for a little conversation"
                    />
                    <Stat
                      icon={<Grid3X3 />}
                      label="MATRIX MODE"
                      value={
                        s.settings.matrix.mode === "off"
                          ? "Off"
                          : s.settings.matrix.mode === "custom"
                            ? "Custom animation"
                            : s.settings.matrix.mode === "text"
                              ? "Scrolling text"
                              : s.settings.matrix.mode[0].toUpperCase() +
                                s.settings.matrix.mode.slice(1)
                      }
                      sub="12 × 8 pixels of possibility"
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="card display-card">
                      <CardTitle
                        eyebrow="THE REAL-WORLD VIEW"
                        title="A window to your desk"
                        right={
                          <span className="badge">
                            <span className="status-dot" />
                            Server preview
                          </span>
                        }
                      />
                      <div className="hardware-stage">
                        <div className="lcd-board">
                          <span className="screw tl" />
                          <span className="screw tr" />
                          <span className="screw bl" />
                          <span className="screw br" />
                          <div
                            className={"lcd " + (!s.frame.backlight ? "dark" : "")}
                            aria-label={`LCD preview: ${s.frame.line1} ${s.frame.line2}`}
                          >
                            <div>{s.frame.line1}</div>
                            <div>{s.frame.line2}</div>
                          </div>
                          <span className="board-label">1602 · CHARACTER DISPLAY</span>
                        </div>
                        <div className="stage-label">
                          <span className="pulse-dot" />
                          {s.frame.clock
                            ? "Keeping up with your world"
                            : "A message takes the stage"}
                        </div>
                      </div>
                      <div className="display-footer">
                        <span>
                          <span className="status-dot" />
                          {s.settings.calendar === "persian"
                            ? "Jalali calendar"
                            : "Gregorian calendar"}
                        </span>
                        <span>{s.settings.hour12 ? "12" : "24"}-hour format</span>
                        <button onClick={() => setPage("clock")}>
                          Customize <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </section>
                    <section className="card matrix-card">
                      <CardTitle
                        eyebrow="A LITTLE PERSONALITY"
                        title="Lights, pixels, action"
                        right={<Grid3X3 size={19} />}
                      />
                      <div className="matrix-stage">
                        <Matrix hex={s.frame.matrix} />
                      </div>
                      <div className="matrix-caption">
                        <strong>
                          {s.settings.matrix.mode === "text"
                            ? s.settings.matrix.text
                            : s.settings.matrix.mode === "off"
                              ? "Taking a little break"
                              : `${s.settings.matrix.mode[0].toUpperCase() + s.settings.matrix.mode.slice(1)} animation`}
                        </strong>
                        <span>BUILT-IN LED MATRIX · 12 × 8</span>
                      </div>
                      <button className="studio-link" onClick={() => setPage("matrix")}>
                        Open LED studio <ArrowUpRight size={17} />
                      </button>
                    </section>
                    <section className="card">
                      <CardTitle
                        eyebrow="SAY SOMETHING"
                        title="A note for your screen"
                        right={<MessageSquare size={19} />}
                      />
                      <MessageComposer
                        onSend={async (text, duration) => {
                          await api("messages", "POST", { text, duration });
                          notice("Message queued");
                        }}
                        compact
                      />
                    </section>
                    <section className="card quick-card">
                      <CardTitle
                        eyebrow="MAKE IT YOURS"
                        title="The little details"
                        right={<Settings2 size={19} />}
                      />
                      <div className="quick-row">
                        <span className="mini-icon">
                          {s.settings.backlight ? <Sun size={18} /> : <Moon size={18} />}
                        </span>
                        <div>
                          <strong>LCD backlight</strong>
                          <small>
                            {s.settings.backlight
                              ? "A little glow for your desk"
                              : "Lights out, clock on"}
                          </small>
                        </div>
                        <Toggle
                          label="LCD backlight"
                          checked={s.settings.backlight}
                          onChange={(value) =>
                            save({ ...s.settings, backlight: value }).catch(() => {})
                          }
                        />
                      </div>
                      <div className="quick-row">
                        <span className="mini-icon">
                          <Clock3 size={18} />
                        </span>
                        <div>
                          <strong>Time & calendar</strong>
                          <small>
                            {s.settings.timezone} ·{" "}
                            {s.settings.calendar === "persian" ? "Jalali" : "Gregorian"}
                          </small>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="Edit time settings"
                          onClick={() => setPage("clock")}
                        >
                          <ArrowUpRight size={19} />
                        </button>
                      </div>
                      <p className="quiet-note">
                        <Info size={14} />
                        Changes are sent to your device automatically.
                      </p>
                    </section>
                  </div>
                  <div className="bottom-note">
                    <span>THOUGHTFULLY CONNECTED</span>
                    <p>Server does the thinking. Your Arduino brings it to life.</p>
                    <span>MQTT / 5 FPS</span>
                  </div>
                </>
              )}
              {page === "clock" && (
                <ClockSettings settings={s.settings} save={save} frame={s.frame} />
              )}
              {page === "messages" && (
                <div className="detail-grid">
                  <section className="card">
                    <CardTitle eyebrow="FROM HERE TO THERE" title="Compose a message" />
                    <MessageComposer
                      onSend={async (text, duration) => {
                        await api("messages", "POST", { text, duration });
                        notice("Message queued");
                      }}
                    />
                  </section>
                  <section className="card">
                    <CardTitle eyebrow="ON THE WAY" title="Message queue" />
                    <div className="message-list">
                      {s.messages
                        .slice()
                        .reverse()
                        .map((m) => {
                          const status = m.cancelled
                            ? "Cancelled"
                            : m.expiresAt <= s.serverTime
                              ? "Delivered window ended"
                              : m.startsAt > s.serverTime
                                ? "Queued"
                                : "On screen";
                          return (
                            <div className="message-item" key={m.id}>
                              <div>
                                <strong>{m.text}</strong>
                                <small>
                                  {status} ·{" "}
                                  {Math.round((m.expiresAt - m.startsAt) / 1000)}s{" "}
                                  {m.startsAt > s.serverTime
                                    ? `· starts in ${Math.ceil((m.startsAt - s.serverTime) / 1000)}s`
                                    : ""}
                                </small>
                              </div>
                              {!m.cancelled && m.expiresAt > s.serverTime && (
                                <button
                                  className="icon-button"
                                  aria-label="Cancel message"
                                  onClick={() =>
                                    api(`messages/${m.id}`, "DELETE")
                                      .then(() => notice("Message cancelled"))
                                      .catch((e) => notice(e.message))
                                  }
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      {!s.messages.length && (
                        <div className="empty">
                          <MessageSquare size={30} />
                          <h3>Good things start with hello.</h3>
                          <p>Your messages will appear here.</p>
                        </div>
                      )}
                    </div>
                    <p className="quiet-note">
                      <Info size={14} />
                      Windows expire even while the device is offline. “On screen” is the
                      server’s current intent, not a delivery receipt. Cancelling keeps
                      later scheduled windows.
                    </p>
                  </section>
                </div>
              )}
              {page === "matrix" && (
                <MatrixStudio settings={s.settings} hex={s.frame.matrix} save={save} />
              )}
              {page === "device" && (
                <div className="detail-grid">
                  <section className="card">
                    <CardTitle eyebrow="YOUR HARDWARE" title="Meet your Mystery Box" />
                    <div className="device-illustration">
                      <Box size={70} />
                      <span>UNO R4 WIFI</span>
                    </div>
                    <dl className="properties">
                      <dt>Device ID</dt>
                      <dd>{s.deviceId}</dd>
                      <dt>MQTT broker</dt>
                      <dd>{s.broker ? "Connected" : "Disconnected"}</dd>
                      <dt>Hardware</dt>
                      <dd>{s.device.online ? "Online" : "Offline"}</dd>
                      <dt>Last heartbeat</dt>
                      <dd>
                        {s.device.lastSeen
                          ? new Date(s.device.lastSeen).toLocaleString()
                          : "Waiting for first connection"}
                      </dd>
                      <dt>Wi-Fi signal</dt>
                      <dd>{s.device.rssi === null ? "—" : `${s.device.rssi} dBm`}</dd>
                      <dt>Local IP</dt>
                      <dd>{s.device.ip ?? "—"}</dd>
                      <dt>Firmware</dt>
                      <dd>{s.device.firmware ?? "—"}</dd>
                      <dt>Last frame reported</dt>
                      <dd>{s.device.seq ?? "—"}</dd>
                    </dl>
                  </section>
                  <section className="card">
                    <CardTitle eyebrow="GET CONNECTED" title="From server to screen" />
                    <ol className="setup-steps">
                      <li>
                        <strong>Wire up your display</strong>
                        <p>
                          VCC → 5V, GND → GND, SDA → A4, SCL → A5. Use the UNO headers for
                          this 5V LCD.
                        </p>
                      </li>
                      <li>
                        <strong>Add your connection details</strong>
                        <p>
                          Copy arduino_secrets.h.example in the firmware folder. Set your
                          Wi-Fi, broker hostname, TLS port, CA and device password.
                        </p>
                      </li>
                      <li>
                        <strong>Upload the sketch</strong>
                        <p>
                          Select Arduino UNO R4 WiFi in Arduino IDE. Install the libraries
                          listed in the README, then upload mystery_box.ino.
                        </p>
                      </li>
                      <li>
                        <strong>Watch it come alive</strong>
                        <p>
                          Your board subscribes to its display stream. This page updates
                          when the first heartbeat arrives.
                        </p>
                      </li>
                    </ol>
                    <p className="quiet-note">
                      <Info size={14} />
                      See the repository’s README and docs/deployment.md for full
                      instructions. This dashboard never exposes device credentials.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            <Brand small />
            <span>A small connection to something real.</span>
            <span>Designed for UNO R4 WiFi</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
          <button aria-label="Dismiss" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={"brand " + (small ? "small" : "")}>
      <span>
        <Box size={small ? 15 : 23} />
      </span>
      <strong>
        mystery<span>box</span>
      </strong>
      {!small && <i>®</i>}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  sub,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  status?: boolean;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        {icon}
      </div>
      <strong className={status ? "green" : ""}>
        {status && <span className="status-dot" />}
        {value}
      </strong>
      <small>{sub}</small>
    </div>
  );
}
function CardTitle({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="card-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {right}
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={"toggle " + (checked ? "on" : "")}
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
function Matrix({
  hex,
  editable,
  onChange,
}: {
  hex: string;
  editable?: boolean;
  onChange?: (hex: string) => void;
}) {
  return (
    <div
      className={"matrix " + (editable ? "editable" : "")}
      role={editable ? "group" : "img"}
      aria-label={editable ? "12 by 8 pixel editor" : "Live 12 by 8 LED matrix preview"}
    >
      {decodePixels(hex).map((p, i) =>
        editable ? (
          <button
            type="button"
            key={i}
            className={p ? "lit" : ""}
            aria-label={`Pixel row ${Math.floor(i / 12) + 1}, column ${(i % 12) + 1}`}
            aria-pressed={!!p}
            onClick={() => {
              const pixels = decodePixels(hex);
              pixels[i] = 1 - pixels[i];
              onChange?.(encodePixels(pixels));
            }}
          />
        ) : (
          <i key={i} className={p ? "lit" : ""} />
        ),
      )}
    </div>
  );
}
function MessageComposer({
  onSend,
  compact = false,
}: {
  onSend: (text: string, duration: number) => Promise<void>;
  compact?: boolean;
}) {
  const [text, setText] = useState(""),
    [duration, setDuration] = useState(15),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="composer"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await onSend(text, duration);
          setText("");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="textarea-wrap">
        <textarea
          aria-label="Message text"
          placeholder="Hello, world. Or just someone special…"
          maxLength={160}
          required
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={compact ? 2 : 4}
        />
        <span>{text.length}/160</span>
      </div>
      <p className="input-note">
        Latin letters & numbers · Long messages scroll automatically.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="composer-actions">
        <label>
          Show for{" "}
          <select
            aria-label="Message duration"
            value={duration}
            onChange={(e) => setDuration(+e.target.value)}
          >
            {[5, 15, 30, 60, 120, 300].map((v) => (
              <option key={v} value={v}>
                {v} seconds
              </option>
            ))}
          </select>
        </label>
        <button disabled={busy || !text.trim()} className="primary">
          {busy ? <LoaderCircle size={16} className="spin" /> : <Send size={15} />}
          Send message
        </button>
      </div>
    </form>
  );
}
function ClockSettings({
  settings,
  save,
  frame,
}: {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
  frame: Snapshot["frame"];
}) {
  const [draft, setDraft] = useState(settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <div className="detail-grid">
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save(draft);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <CardTitle eyebrow="SET YOUR RHYTHM" title="Time & calendar" />
        <label htmlFor="timezone">Timezone</label>
        <input
          id="timezone"
          list="timezones"
          value={draft.timezone}
          onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
        />
        <datalist id="timezones">
          {["UTC", ...zones].map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <p className="input-note">
          IANA timezones automatically follow daylight saving changes.
        </p>
        <label>Calendar</label>
        <div className="segmented">
          {(["persian", "gregory"] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={draft.calendar === c ? "selected" : ""}
              onClick={() => setDraft({ ...draft, calendar: c })}
            >
              {c === "persian" ? "Persian · جلالی" : "Gregorian"}
            </button>
          ))}
        </div>
        <label htmlFor="dateOrder">Date format</label>
        <select
          id="dateOrder"
          value={draft.dateOrder}
          onChange={(e) =>
            setDraft({
              ...draft,
              dateOrder: e.target.value as Settings["dateOrder"],
            })
          }
        >
          <option value="ymd">Year / Month / Day</option>
          <option value="dmy">Day / Month / Year</option>
          <option value="mdy">Month / Day / Year</option>
        </select>
        <div className="setting-row">
          <div>
            <strong>12-hour clock</strong>
            <small>Include AM / PM</small>
          </div>
          <Toggle
            label="12-hour clock"
            checked={draft.hour12}
            onChange={(v) => setDraft({ ...draft, hour12: v })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Show seconds</strong>
            <small>Keep track of the little moments</small>
          </div>
          <Toggle
            label="Show seconds"
            checked={draft.showSeconds}
            onChange={(v) => setDraft({ ...draft, showSeconds: v })}
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>LCD backlight</strong>
            <small>Leave a little light on</small>
          </div>
          <Toggle
            label="LCD backlight"
            checked={draft.backlight}
            onChange={(v) => setDraft({ ...draft, backlight: v })}
          />
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
          Save display settings
        </button>
      </form>
      <section className="card">
        <CardTitle eyebrow="CURRENT SERVER OUTPUT" title="The view from here" />
        <div className="settings-preview">
          <div className={"lcd " + (!frame.backlight ? "dark" : "")}>
            <div>{frame.line1}</div>
            <div>{frame.line2}</div>
          </div>
        </div>
        <p className="quiet-note">
          <Info size={16} />
          The preview shows saved settings. Jalali dates use Latin digits because a
          standard 1602 LCD cannot render arbitrary Persian letters or digits. J = Jalali;
          G = Gregorian.
        </p>
        <p className="quiet-note">
          <Clock3 size={16} />
          Time comes from your server’s system clock. Keep the host synchronized with NTP.
          During outages, the Arduino continues from its last RTC synchronization.
        </p>
      </section>
    </div>
  );
}
function MatrixStudio({
  settings,
  hex,
  save,
}: {
  settings: Settings;
  hex: string;
  save: (s: Settings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings.matrix),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const modes = [
    ["off", "Lights off"],
    ["heart", "Heartbeat"],
    ["wave", "Sine wave"],
    ["rain", "Pixel rain"],
    ["text", "Scrolling text"],
    ["custom", "Draw your own"],
  ] as const;
  return (
    <div className="detail-grid">
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await save({ ...settings, matrix: draft });
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <CardTitle eyebrow="MAKE A LITTLE LIGHT" title="Choose your expression" />
        <div className="mode-grid">
          {modes.map(([id, title]) => (
            <button
              type="button"
              key={id}
              className={draft.mode === id ? "selected" : ""}
              onClick={() => setDraft({ ...draft, mode: id })}
            >
              {id === "off" ? (
                <Moon size={19} />
              ) : id === "text" ? (
                <MessageSquare size={19} />
              ) : (
                <Grid3X3 size={19} />
              )}
              <span>{title}</span>
              {draft.mode === id && <Check size={15} />}
            </button>
          ))}
        </div>
        {draft.mode === "text" && (
          <>
            <label htmlFor="matrix-text">Your scrolling text</label>
            <input
              id="matrix-text"
              maxLength={80}
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
            <p className="input-note">
              Latin alphabet, numbers and ASCII punctuation. Lowercase renders as
              capitals.
            </p>
          </>
        )}
        <label htmlFor="speed">
          Animation speed <span>{draft.speed} / 10</span>
        </label>
        <input
          id="speed"
          type="range"
          min="1"
          max="10"
          value={draft.speed}
          onChange={(e) => setDraft({ ...draft, speed: +e.target.value })}
        />
        <p className="input-note">Live stream is capped at 5 frames per second.</p>
        {draft.mode === "custom" && (
          <>
            <label>Animation frames · {draft.frames.length} / 32</label>
            <div className="frame-tabs">
              {draft.frames.map((_, i) => (
                <button
                  type="button"
                  key={i}
                  className={index === i ? "selected" : ""}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={draft.frames.length >= 32}
                aria-label="Add frame"
                onClick={() => {
                  setIndex(draft.frames.length);
                  setDraft({
                    ...draft,
                    frames: [...draft.frames, "0".repeat(24)],
                  });
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="editor">
              <Matrix
                editable
                hex={draft.frames[index]}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    frames: draft.frames.map((f, i) => (i === index ? value : f)),
                  })
                }
              />
            </div>
            <div className="editor-actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setDraft({
                    ...draft,
                    frames: draft.frames.map((f, i) =>
                      i === index ? "0".repeat(24) : f,
                    ),
                  })
                }
              >
                <RotateCcw size={14} />
                Clear
              </button>
              <button
                type="button"
                className="secondary"
                disabled={draft.frames.length >= 32}
                onClick={() => {
                  setIndex(draft.frames.length);
                  setDraft({
                    ...draft,
                    frames: [...draft.frames, draft.frames[index]],
                  });
                }}
              >
                <Copy size={14} />
                Duplicate
              </button>
              <button
                type="button"
                className="secondary"
                disabled={draft.frames.length === 1}
                onClick={() => {
                  setDraft({
                    ...draft,
                    frames: draft.frames.filter((_, i) => i !== index),
                  });
                  setIndex(Math.max(0, index - 1));
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}
          Send to matrix
        </button>
      </form>
      <section className="card">
        <CardTitle eyebrow="CURRENT SERVER OUTPUT" title="Small pixels, big ideas" />
        <div className="studio-preview">
          <Matrix hex={hex} />
        </div>
        <p className="quiet-note">
          <Info size={16} />
          This is the live output of your saved animation. Draw frames on the left, then
          send them to the matrix to play in a loop. Your Arduino only receives the
          current 96 pixels.
        </p>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
