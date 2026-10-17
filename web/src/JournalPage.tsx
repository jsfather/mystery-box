import { Fragment, useCallback, useEffect, useState, useRef } from "react";
import { MessageSquare, RefreshCcw, ChevronDown, Heart, NotebookPen } from "lucide-react";
import type { Snapshot, Message, ActivityEntry, User } from "../../shared/model";
import { ConversationMessage } from "./ConversationMessage";
import { MessageSearch } from "./MessageSearch";
import { MessageComposer } from "./MessageComposer";
import { api } from "./api";
export function MessageHistory({
  snapshot,
  notice,
  me,
}: {
  snapshot: Snapshot;
  notice: (s: string) => void;
  me: User;
}) {
  const [items, setItems] = useState<Message[]>([]),
    [next, setNext] = useState<number | null>(null),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [unseen, setUnseen] = useState(false);
  const requestId = useRef(0),
    conversation = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    initialized = useRef(false),
    activeSearch = useRef(search);
  const openedAt = useRef(snapshot.serverTime),
    seen = useRef(new Set<string>());
  const [arriving, setArriving] = useState(new Set<string>());
  useEffect(() => {
    if (!arriving.size) return;
    const timer = setTimeout(() => setArriving(new Set()), 600);
    return () => clearTimeout(timer);
  }, [arriving]);
  const signature = snapshot.messages.map((m) => m.id + Number(m.cancelled)).join(",");
  const scrollBottom = useCallback(() => {
    const box = conversation.current;
    if (box) box.scrollTop = box.scrollHeight;
    nearBottom.current = true;
    setUnseen(false);
  }, []);
  const load = useCallback(
    async (before?: number) => {
      const request = ++requestId.current;
      setBusy(true);
      setError("");
      const box = conversation.current,
        previousHeight = box?.scrollHeight ?? 0;
      try {
        const result = await api(
          `messages?q=${encodeURIComponent(search)}${before ? `&before=${before}` : ""}`,
        );
        if (request !== requestId.current) return;
        for (const message of result.items) seen.current.add(message.id);
        setItems((old) =>
          before
            ? [...result.items, ...old].filter(
                (m, i, all) => all.findIndex((v) => v.id === m.id) === i,
              )
            : result.items,
        );
        setNext(result.nextCursor);
        initialized.current = true;
        requestAnimationFrame(() => {
          if (before && box) box.scrollTop += box.scrollHeight - previousHeight;
          else scrollBottom();
        });
      } catch (e) {
        if (request === requestId.current) setError((e as Error).message);
      } finally {
        if (request === requestId.current) setBusy(false);
      }
    },
    [search, scrollBottom],
  );
  useEffect(() => {
    activeSearch.current = search;
    initialized.current = false;
    setBusy(true);
    const timer = setTimeout(() => load(), 200);
    return () => {
      clearTimeout(timer);
      requestId.current++;
    };
  }, [load, search]);
  useEffect(() => {
    if (!initialized.current || activeSearch.current !== search) return;
    const matches = snapshot.messages.filter((m) =>
      m.text.toLowerCase().includes(search.toLowerCase()),
    );
    const fresh = matches.filter(
      (m) => !seen.current.has(m.id) && m.createdAt >= openedAt.current,
    );
    for (const message of matches) seen.current.add(message.id);
    if (fresh.length) setArriving((old) => new Set([...old, ...fresh.map((m) => m.id)]));
    setItems((old) => {
      const merged = new Map(old.map((m) => [m.id, m]));
      for (const m of matches) merged.set(m.id, m);
      return [...merged.values()];
    });
    if (nearBottom.current) requestAnimationFrame(scrollBottom);
    else setUnseen(true);
  }, [signature, search, scrollBottom]);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: snapshot.settings.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: snapshot.settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: snapshot.settings.hour12,
  });
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: snapshot.settings.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const ordered = [...items].sort(
    (a, b) => (a.cursor ?? a.createdAt) - (b.cursor ?? b.createdAt),
  );
  return (
    <section className="card conversation-card">
      <div className="card-title">
        <div>
          <span className="eyebrow">YOU, ME, AND OUR LITTLE NOTES</span>
          <h2>Our conversation</h2>
          <p className="input-note">
            Signed in as {me.name}. Every note is saved and queued for our box.
          </p>
        </div>
        <Heart size={22} />
      </div>
      <MessageSearch value={search} onChange={setSearch} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div
        id="conversation-messages"
        className="conversation"
        ref={conversation}
        role="region"
        aria-label="Our shared conversation"
        tabIndex={0}
        onScroll={() => {
          const b = conversation.current!;
          nearBottom.current = b.scrollHeight - b.scrollTop - b.clientHeight < 90;
          if (nearBottom.current) setUnseen(false);
        }}
      >
        {next && (
          <button
            className="secondary earlier-chat"
            disabled={busy}
            onClick={() => load(next)}
          >
            Earlier messages
          </button>
        )}
        {busy && !ordered.length && (
          <p className="quiet-note" role="status">
            Opening our conversation…
          </p>
        )}
        {!ordered.length && !busy && (
          <div className="empty">
            <MessageSquare size={30} />
            <h3>A little hello starts everything.</h3>
            <p>Your messages appear here with who sent them.</p>
          </div>
        )}
        {ordered.map((message, index) => {
          const previous = ordered[index - 1],
            date = day.format(message.createdAt);
          const newDay = !previous || day.format(previous.createdAt) !== date;
          const grouped =
            !newDay &&
            (previous.authorId ?? previous.authorName) ===
              (message.authorId ?? message.authorName) &&
            message.createdAt - previous.createdAt >= 0 &&
            message.createdAt - previous.createdAt <= 300000;
          return (
            <Fragment key={message.id}>
              {newDay && (
                <div className="chat-day">
                  <span>{date === day.format(snapshot.serverTime) ? "Today" : date}</span>
                </div>
              )}
              <ConversationMessage
                message={message}
                own={message.authorId === me.id}
                grouped={grouped}
                animate={arriving.has(message.id)}
                now={snapshot.serverTime}
                time={time.format(message.createdAt)}
                timestamp={formatter.format(message.createdAt)}
                onCancel={() =>
                  api(`messages/${message.id}`, "DELETE").catch((e) =>
                    setError(e.message),
                  )
                }
                onReplay={() =>
                  api(`messages/${message.id}/replay`, "POST")
                    .then(() => notice("Message queued for the box again"))
                    .catch((e) => setError(e.message))
                }
              />
            </Fragment>
          );
        })}
      </div>
      {unseen && (
        <button className="secondary new-messages" onClick={scrollBottom}>
          Latest messages ↓
        </button>
      )}
      <div className="chat-composer">
        <MessageComposer
          compact
          defaultDuration={snapshot.settings.messaging.defaultDuration}
          onSend={async (text, duration) => {
            const saved = await api("messages", "POST", { text, duration });
            seen.current.add(saved.id);
            setArriving((old) => new Set([...old, saved.id]));
            if (search) setSearch("");
            else setItems((old) => [...old.filter((m) => m.id !== saved.id), saved]);
            requestAnimationFrame(scrollBottom);
            notice("Sent to our conversation & queued for the box");
          }}
        />
      </div>
      <details className="chat-help">
        <summary>About messages on our box</summary>
        <p>
          The conversation stays here after a message leaves the LCD. Display windows can
          expire while the box is offline; an active window does not confirm it was seen.
        </p>
      </details>
    </section>
  );
}
const labels: Record<string, string> = {
  "factory.reset": "Restored factory settings",
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
export function ActivityPage({ timezone }: { timezone: string }) {
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
                {new Date(entry.createdAt).toLocaleString("en-GB", {
                  timeZone: timezone,
                })}
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
