import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  LayoutDashboard,
  Clock3,
  MessageSquare,
  Grid3X3,
  Gamepad2,
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
  LoaderCircle,
  LockKeyhole,
  ChevronRight,
  Activity,
  Cable,
  Info,
  Play,
  Copy,
  RotateCcw,
  Heart,
  UsersRound,
  NotebookPen,
} from "lucide-react";
import type { Settings, Snapshot, User } from "../../shared/model";
import { decodePixels, encodePixels } from "../../server/render";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import { api, type SaveSettings } from "./api";
import { MessageComposer } from "./MessageComposer";
import { LoveHero, LovePage } from "./LovePage";
import { PeoplePage } from "./PeoplePage";
import { MessageHistory, ActivityPage } from "./JournalPage";
import { InstallApp, registerPwa } from "./pwa";
import "./style.css";
import "./love.css";
import "./theme.css";
import { TimezoneSelect } from "./TimezoneSelect";
import { HeaderConnection, AppearanceButton } from "./HeaderControls";
import { Preferences, ThemeControl } from "./Preferences";
import { GamesPage } from "./GamesPage";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { matrixCatalog, matrixFrame, matrixProgram } from "../../shared/matrix";
type Page =
  | "overview"
  | "clock"
  | "messages"
  | "matrix"
  | "games"
  | "device"
  | "love"
  | "people"
  | "activity"
  | "preferences";
const pageInfo: Record<Page, [string, string]> = {
  preferences: ["Preferences", "A few little details, just the way we like them."],
  overview: [
    "Our little world",
    "A little love, a little light. A place that’s just ours.",
  ],
  love: ["Our story", "From one special second, to a lifetime of little moments."],
  people: ["You & me", "Separate accounts. One little world to share."],
  activity: ["Our journal", "The little things we’ve changed, sent and shared."],
  clock: ["Time & display", "Your time, your calendar, your corner of the world."],
  messages: ["Messages", "Send a little something to the real world."],
  games: ["Games", "A tiny arcade, right on your desk."],
  matrix: ["LED studio", "Twelve by eight pixels. Make every one count."],
  device: ["Connection", "Everything between your server and your desk."],
};
function App() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [username, setUsername] = useState(""),
    [me, setMe] = useState<User | null>(null),
    [password, setPassword] = useState(""),
    [loginError, setLoginError] = useState(""),
    [busy, setBusy] = useState(false);
  const [receivedSnapshot, setSnapshot] = useState<Snapshot | null>(null),
    [live, setLive] = useState(false),
    [page, setPage] = useState<Page>("overview"),
    [toast, setToast] = useState("");
  const snapshot = useLiveSnapshot(receivedSnapshot);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    api("session")
      .then((s) => {
        setAuth(s.authenticated);
        setMe(s.user);
      })
      .catch(() => {
        setAuth(false);
        setLoginError("Cannot reach server. Please try again.");
      });
  }, []);
  useEffect(() => {
    const expire = () => {
      setAuth(false);
      setMe(null);
      setSnapshot(null);
    };
    window.addEventListener("mb-auth-expired", expire);
    return () => window.removeEventListener("mb-auth-expired", expire);
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
  useEffect(() => {
    window.scrollTo(0, 0);
    const mobile = window.matchMedia("(max-width: 640px)");
    const revealCurrentPage = () => {
      if (mobile.matches)
        document
          .querySelector('nav [aria-current="page"]')
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    revealCurrentPage();
    mobile.addEventListener("change", revealCurrentPage);
    return () => mobile.removeEventListener("change", revealCurrentPage);
  }, [page, auth]);
  function notice(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }
  async function save(s: Settings, expectedRevision = snapshot!.settingsRevision) {
    try {
      const result = await api("settings", "PUT", s, {
        "If-Match": String(expectedRevision),
      });
      notice("Saved to our little world");
      return result.revision as number;
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
      const result = await api("login", "POST", { username, password });
      setMe(result.user);
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
            <span className="eyebrow">FOR ALL OUR LITTLE MOMENTS.</span>
            <h1>
              One little box,
              <br />a lifetime of us<span>.</span>
            </h1>
            <p>
              Every second together. Every little note.
              <br />A small reminder of something extraordinary.
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
          <h2>Welcome home, love.</h2>
          <p>Your own account. Our shared little world.</p>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={32}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your username"
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            required
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
                Come on in <ArrowRight size={17} />
              </>
            )}
          </button>
          <ThemeControl expanded />
          <small>Just you, me, and all the seconds in between.</small>
        </form>
      </div>
    );
  function signOut() {
    api("logout", "POST")
      .then(() => {
        setAuth(false);
        setMe(null);
        setSnapshot(null);
      })
      .catch((e) => notice(e.message));
  }
  const s = snapshot;
  return (
    <div className={`shell${page === "messages" ? " conversation-view" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-header">
          <Brand />
          <div className="mobile-header-actions">
            <AppearanceButton />
            <HeaderConnection live={live} snapshot={s} />
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-icon">
            <Box size={20} />
          </span>
          <div>
            <strong>{me?.name ?? "Our space"}</strong>
            <small>Our shared little world</small>
          </div>
          <span className="tiny-pill">01</span>
        </div>
        <span className="nav-caption">AT HOME, TOGETHER</span>
        <nav>
          {(
            [
              ["overview", LayoutDashboard, "Our little world"],
              ["love", Heart, "Our story"],
              ["clock", Clock3, "Time & display"],
              ["messages", MessageSquare, "Messages"],
              ["matrix", Grid3X3, "LED studio"],
              ["games", Gamepad2, "Games"],
              ["device", Radio, "Connection"],
              ["people", UsersRound, "You & me"],
              ["activity", NotebookPen, "Our journal"],
              ["preferences", Settings2, "Preferences"],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
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
            <strong>Made for the two of us</strong>
            <p>
              UNO R4 WiFi + 1602 LCD
              <br />
              One little reminder of us.
            </p>
            <Cable size={31} />
          </div>

          <small className="version">MYSTERY BOX / V1.1</small>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Our space <ChevronRight size={14} />
            <strong>{pageInfo[page][0]}</strong>
          </div>
          <div className="top-status">
            <AppearanceButton />
            <HeaderConnection live={live} snapshot={s} />
            <span className="avatar" title={me?.name}>
              {me?.name.slice(0, 1) ?? "♥"}
            </span>
          </div>
        </header>
        <main
          className={
            page === "messages"
              ? "messages-page"
              : page === "games"
                ? "games-page"
                : undefined
          }
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">SOMEWHERE ONLY WE KNOW</div>
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
          {s && !live && (
            <div className="connection-banner" role="status">
              Reconnecting to our little world. The preview is paused; sending and saving
              need a connection.
            </div>
          )}
          {!s ? (
            <div className="loading">
              <LoaderCircle className="spin" />
              <p>Connecting to your server…</p>
            </div>
          ) : (
            <React.Fragment key={s.resetRevision}>
              {page === "overview" && (
                <>
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
                          {s.frame.love
                            ? "Every second, together"
                            : s.frame.clock
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
                        defaultDuration={s.settings.messaging.defaultDuration}
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
                      <div className="quick-mode">
                        <label htmlFor="quick-mode">What should our box show?</label>
                        <select
                          id="quick-mode"
                          value={s.settings.displayMode}
                          onChange={(e) =>
                            save({
                              ...s.settings,
                              displayMode: e.target.value as Settings["displayMode"],
                            }).catch(() => {})
                          }
                        >
                          <option value="clock">Date & time</option>
                          <option value="love" disabled={!s.settings.love.startAt}>
                            Our time together
                          </option>
                          <option value="alternate" disabled={!s.settings.love.startAt}>
                            Clock & story · every 12 seconds
                          </option>
                          <option value="scheduled" disabled={!s.settings.love.startAt}>
                            Clock & scheduled story moments
                          </option>
                        </select>
                        <button onClick={() => setPage("love")}>
                          Edit story schedule & format <ArrowUpRight size={14} />
                        </button>
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
                  <div className="overview-story">
                    <LoveHero snapshot={s} onSetup={() => setPage("love")} />
                  </div>
                  <div className="bottom-note">
                    <span>THOUGHTFULLY CONNECTED</span>
                    <p>Server does the thinking. Your Arduino brings it to life.</p>
                    <span>MQTT / 5 FPS</span>
                  </div>
                </>
              )}
              {page === "clock" && (
                <ClockSettings
                  settings={s.settings}
                  revision={s.settingsRevision}
                  save={save}
                  frame={s.frame}
                />
              )}
              {page === "messages" && (
                <MessageHistory snapshot={s} notice={notice} me={me!} />
              )}
              {page === "love" && <LovePage snapshot={s} save={save} />}
              {page === "people" && me && (
                <PeoplePage me={me} onMeChange={setMe} onSignOut={signOut} />
              )}
              {page === "activity" && (
                <ActivityPage timezone={s.settings.timezone} errors={s.device.errors} />
              )}
              {page === "preferences" && (
                <Preferences snapshot={s} save={save} notice={notice} />
              )}
              {page === "games" && me && (
                <GamesPage snapshot={s} me={me} live={live} save={save} />
              )}
              {page === "matrix" && (
                <MatrixStudio
                  settings={s.settings}
                  revision={s.settingsRevision}
                  hex={s.frame.matrix}
                  appliedRevision={s.device.matrixRevision}
                  save={save}
                />
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
                          ? new Date(s.device.lastSeen).toLocaleString("en-GB", {
                              timeZone: s.settings.timezone,
                            })
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
            </React.Fragment>
          )}
          <InstallApp />
          <footer>
            <Brand small />
            <span>For all the seconds still to come.</span>
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
        <span>{value}</span>
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
function ClockSettings({
  settings,
  revision,
  save,
  frame,
}: {
  settings: Settings;
  save: SaveSettings;
  revision: number;
  frame: Snapshot["frame"];
}) {
  const [draft, setDraft] = useState(settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const baseline = useRef(revision);
  return (
    <div className="detail-grid">
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            baseline.current = await save(draft, baseline.current);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <CardTitle eyebrow="SET YOUR RHYTHM" title="Time & calendar" />
        <label htmlFor="timezone">Timezone</label>
        <TimezoneSelect
          id="timezone"
          value={draft.timezone}
          onChange={(timezone) => setDraft({ ...draft, timezone })}
        />
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
          The Arduino keeps ticking locally between updates and during outages.
        </p>
      </section>
    </div>
  );
}
function MatrixStudio({
  settings,
  revision,
  hex,
  save,
  appliedRevision,
}: {
  settings: Settings;
  hex: string;
  save: SaveSettings;
  revision: number;
  appliedRevision?: number;
}) {
  const [draft, setDraft] = useState(settings.matrix),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [group, setGroup] = useState("All"),
    [previewTime, setPreviewTime] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = setInterval(() => setPreviewTime(performance.now() - start), 33);
    return () => clearInterval(timer);
  }, []);
  const baseline = useRef(revision);
  const groups = ["All", "Love", "Nature", "Space", "Patterns", "Play", "Create"];
  const selected = matrixCatalog.find((m) => m.id === draft.mode)!;
  return (
    <div className="detail-grid">
      <form
        className="card form-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            baseline.current = await save(
              { ...settings, matrix: draft },
              baseline.current,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <CardTitle eyebrow="MAKE A LITTLE LIGHT" title="Choose your expression" />
        <p className="input-note">
          24 expressions. Every animation plays locally on your box, even when Wi-Fi takes
          a break.
        </p>
        <div
          className="animation-categories"
          role="group"
          aria-label="Animation categories"
        >
          {groups.map((g) => (
            <button
              type="button"
              key={g}
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <p className="input-note">Selected: {selected.name}</p>
        <div className="mode-grid">
          {matrixCatalog
            .filter((m) => group === "All" || m.group === group)
            .map(({ id, name: title }) => (
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
        <p className="input-note">
          Speed changes the playback on your Arduino. No streamed frames to wait for.
        </p>
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
        <CardTitle eyebrow="TRY BEFORE YOU SEND" title={selected.name} />
        <div className="studio-preview">
          <Matrix hex={matrixFrame(draft, previewTime)} />
        </div>
        <p className="quiet-note">
          <Info size={16} />
          This preview follows your choices before saving. Send to matrix to play it on
          your box.
        </p>
        <CardTitle
          eyebrow="ON YOUR BOX"
          title={matrixCatalog.find((m) => m.id === settings.matrix.mode)!.name}
        />
        <div className="studio-preview">
          <Matrix hex={hex} />
        </div>
        <p className="input-note">
          {appliedRevision === matrixProgram(settings.matrix).revision
            ? "Playback confirmed by your Arduino."
            : "Preview of saved settings. Waiting for the next device confirmation."}
        </p>
      </section>
    </div>
  );
}

registerPwa();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
