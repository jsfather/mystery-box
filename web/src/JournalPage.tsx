import { useCallback, useEffect, useState, useRef } from "react";
import {
  MessageSquare,
  RefreshCcw,
  Search,
  Heart,
  Clock3,
  ChevronDown,
  NotebookPen,
  X,
  Send,
} from "lucide-react";
import type { Snapshot, Message, ActivityEntry } from "../../shared/model";
import { MessageComposer } from "./MessageComposer";
import { api } from "./api";
export function MessageHistory({
  snapshot,
  notice,
}: {
  snapshot: Snapshot;
  notice: (s: string) => void;
}) {
  const [items, setItems] = useState<Message[]>([]),
    [next, setNext] = useState<number | null>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const signature = snapshot.messages.map((m) => m.id + Number(m.cancelled)).join(",");
  const load = useCallback(
    async (before?: number) => {
      const request = ++requestId.current;
      setBusy(true);
      setError("");
      try {
        const result = await api(
          `messages?q=${encodeURIComponent(search)}${before ? `&before=${before}` : ""}`,
        );
        if (request !== requestId.current) return;
        setItems((old) => (before ? [...old, ...result.items] : result.items));
        setNext(result.nextCursor);
      } catch (e) {
        if (request === requestId.current) setError((e as Error).message);
      } finally {
        if (request === requestId.current) setBusy(false);
      }
    },
    [search],
  );
  useEffect(() => {
    const timer = setTimeout(() => load(), 250);
    return () => clearTimeout(timer);
  }, [load, signature]);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: snapshot.settings.timezone,
    dateStyle: "medium",
    timeStyle: "medium",
  });
  return (
    <div className="message-layout">
      <section className="card message-compose-card">
        <div className="card-title">
          <div>
            <span className="eyebrow">A NOTE, JUST BECAUSE</span>
            <h2>Put a little love on the screen.</h2>
          </div>
          <Heart size={20} />
        </div>
        <MessageComposer
          onSend={async (text, duration) => {
            await api("messages", "POST", { text, duration });
            notice("Your little note is on its way");
            await load();
          }}
        />
        <div className="message-hint">
          <Heart size={22} />
          <p>
            The note may leave the screen.
            <br />
            It stays in our story.
          </p>
        </div>
      </section>
      <section className="card notes-card">
        <div className="card-title">
          <div>
            <span className="eyebrow">WORDS WE GET TO KEEP</span>
            <h2>Our little notes</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh message history"
            onClick={() => load()}
          >
            <RefreshCcw size={17} />
          </button>
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            aria-label="Search message history"
            placeholder="Find a little note…"
            maxLength={160}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="notes-list">
          {items.map((message) => {
            const status = message.cancelled
              ? "Cancelled"
              : message.expiresAt <= snapshot.serverTime
                ? "Saved in our story"
                : message.startsAt > snapshot.serverTime
                  ? "Waiting for its moment"
                  : "On the screen · requested";
            return (
              <article className="note" key={message.id}>
                <div className="note-heading">
                  <span className="note-avatar">
                    {(message.authorName ?? "Us").slice(0, 1)}
                  </span>
                  <div>
                    <strong>{message.authorName ?? "Before accounts"}</strong>
                    <time dateTime={new Date(message.createdAt).toISOString()}>
                      {formatter.format(message.createdAt)}
                    </time>
                  </div>
                  <Heart size={14} />
                </div>
                <p>{message.text}</p>
                <div className="note-footer">
                  <span>
                    <Clock3 size={12} />
                    {status}
                  </span>
                  <div>
                    {!message.cancelled && message.expiresAt > snapshot.serverTime && (
                      <button
                        disabled={busy}
                        aria-label="Cancel message"
                        onClick={() =>
                          api(`messages/${message.id}`, "DELETE")
                            .then(() => load())
                            .catch((e) => setError(e.message))
                        }
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    )}
                    <button
                      disabled={busy}
                      onClick={() =>
                        api(`messages/${message.id}/replay`, "POST")
                          .then(() => {
                            notice("Sent again, with love");
                            return load();
                          })
                          .catch((e) => setError(e.message))
                      }
                    >
                      <Send size={13} />
                      Send again
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {!items.length && !busy && (
            <div className="empty">
              <MessageSquare size={30} />
              <h3>The first note is a lovely place to start.</h3>
              <p>Every message you send is saved here, with its sender.</p>
            </div>
          )}
        </div>
        {next && (
          <button
            className="secondary load-more"
            disabled={busy}
            onClick={() => load(next)}
          >
            <ChevronDown size={15} />
            Earlier notes
          </button>
        )}
        <p className="quiet-note">
          A message window can expire while the box is offline. History records what you
          sent, not a guarantee it was seen on the LCD.
        </p>
      </section>
    </div>
  );
}
const labels: Record<string, string> = {
  "settings.updated": "Changed our box settings",
  "message.sent": "Sent a little note",
  "message.cancelled": "Cancelled a note",
  "user.created": "Made room for another person",
  "user.bootstrapped": "Opened an account",
  "user.updated": "Updated an account",
  "login.succeeded": "Came home",
  "login.failed": "An unsuccessful sign-in",
  logout: "Signed out",
  "broker.error": "The message connection needs a little attention",
  "broker.connected": "The message connection is ready",
  "broker.disconnected": "The message connection paused",
  "device.online": "Our little box came online",
  "device.offline": "Our little box went offline",
  "server.started": "Our little world started up",
  "server.stopped": "Our little world shut down",
};
export function ActivityPage() {
  const [items, setItems] = useState<ActivityEntry[]>([]),
    [next, setNext] = useState<number | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async (before?: number) => {
    setBusy(true);
    setError("");
    try {
      const result = await api("activity" + (before ? `?before=${before}` : ""));
      setItems((old) => (before ? [...old, ...result.items] : result.items));
      setNext(result.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="card journal-card">
      <div className="card-title">
        <div>
          <span className="eyebrow">THE SMALL THINGS, REMEMBERED</span>
          <h2>A shared journal of our box</h2>
        </div>
        <button className="secondary" onClick={() => load()} disabled={busy}>
          <RefreshCcw size={15} />
          Refresh
        </button>
      </div>
      <p className="journal-intro">
        Changes, messages, sign-ins and connections, kept with who and when. Passwords and
        session tokens never go into this journal.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="timeline">
        {items.map((entry) => (
          <article key={entry.id}>
            <span className="timeline-icon">
              {entry.action.startsWith("message") ? (
                <MessageSquare size={16} />
              ) : entry.action.startsWith("user") ? (
                <Heart size={16} />
              ) : (
                <NotebookPen size={16} />
              )}
            </span>
            <div>
              <h3>{labels[entry.action] ?? entry.action}</h3>
              <p>
                {entry.actorName}
                {Array.isArray(entry.details.fields) && entry.details.fields.length
                  ? ` · ${entry.details.fields.join(", ")}`
                  : ""}
                {entry.details.passwordChanged ? " · password changed" : ""}
              </p>
              <time dateTime={new Date(entry.createdAt).toISOString()}>
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </div>
          </article>
        ))}
      </div>
      {next && (
        <button
          className="secondary load-more"
          disabled={busy}
          onClick={() => load(next)}
        >
          <ChevronDown size={15} />
          Earlier moments
        </button>
      )}
    </section>
  );
}
