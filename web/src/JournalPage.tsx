import { Fragment, useCallback, useEffect, useState, useRef } from "react";
import {
  MessageSquare,
  RefreshCcw,
  ChevronDown,
  Heart,
  NotebookPen,
  CheckSquare,
  Trash2,
} from "lucide-react";
import type { Snapshot, Message, ActivityEntry, User } from "../../shared/model";
import { ConversationMessage } from "./ConversationMessage";
import { MessageSearch } from "./MessageSearch";
import { MessageComposer } from "./MessageComposer";
import { api } from "./api";
import { DeleteMessagesDialog } from "./DeleteMessagesDialog";
import { deviceErrors, errorLabel } from "../../shared/errors";
export function MessageHistory({
  snapshot,
  notice,
  me,
}: {
  snapshot: Snapshot;
  notice: (s: string) => void;
  me: User;
}) {
  const [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState(new Set<string>());
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string[] | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState("");
  const deleted = useRef(new Set<string>()),
    itemsRef = useRef<Message[]>([]);
  const historyRevision = useRef(snapshot.historyRevision ?? 0);
  const selectButton = useRef<HTMLButtonElement>(null);
  const choose = (id: string) => {
    setOpenMenu(null);
    setSelecting(true);
    requestAnimationFrame(() =>
      document.getElementById(`select-${id}`)?.focus({ preventScroll: true }),
    );
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else if (next.size < 100) next.add(id);
      return next;
    });
  };
  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const result = await api("messages/delete", "POST", { ids: toDelete });
      for (const id of result.deletedIds) deleted.current.add(id);
      ++requestId.current; // Discard any history fetch started before deletion.
      setBusy(false);
      setItems((old) => old.filter((message) => !deleted.current.has(message.id)));
      setSelected(new Set());
      setSelecting(false);
      setToDelete(null);
      notice(
        `${result.deletedIds.length} ${result.deletedIds.length === 1 ? "message" : "messages"} deleted`,
      );
      requestAnimationFrame(() => selectButton.current?.focus({ preventScroll: true }));
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };
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
  itemsRef.current = items;
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
        const fetched: Message[] = result.items.filter(
          (message: Message) => !deleted.current.has(message.id),
        );
        setItems((old) =>
          before
            ? [...fetched, ...old].filter(
                (m, i, all) => all.findIndex((v) => v.id === m.id) === i,
              )
            : fetched,
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
    setSelected(new Set());
    setOpenMenu(null);
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
    const matches = snapshot.messages.filter(
      (m) =>
        !deleted.current.has(m.id) && m.text.toLowerCase().includes(search.toLowerCase()),
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
  useEffect(() => {
    const revision = snapshot.historyRevision ?? 0;
    if (revision <= historyRevision.current) return;
    ++requestId.current;
    setBusy(false);
    if (!initialized.current) {
      historyRevision.current = revision;
      void load();
      return;
    }
    let cancelled = false;
    const ids = itemsRef.current.map((item) => item.id);
    void (async () => {
      try {
        const missing = new Set<string>();
        for (let start = 0; start < ids.length; start += 100) {
          const batch = ids.slice(start, start + 100);
          const result = await api("messages/lookup", "POST", { ids: batch });
          if (cancelled) return;
          const existing = new Set(result.items.map((item: Message) => item.id));
          for (const id of batch) if (!existing.has(id)) missing.add(id);
        }
        if (cancelled) return;
        historyRevision.current = revision;
        for (const id of missing) deleted.current.add(id);
        setItems((old) => old.filter((item) => !missing.has(item.id)));
        setSelected((old) => new Set([...old].filter((id) => !missing.has(id))));
        setOpenMenu((old) => (old && missing.has(old) ? null : old));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshot.historyRevision]);
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
      <div className="message-management">
        <MessageSearch value={search} onChange={setSearch} />
        <button
          ref={selectButton}
          type="button"
          className="secondary"
          disabled={(!items.length && !selecting) || deleting}
          aria-pressed={selecting}
          onClick={() => {
            setSelecting(!selecting);
            setSelected(new Set());
            setOpenMenu(null);
          }}
        >
          <CheckSquare size={16} />
          {selecting ? "Done" : "Select"}
        </button>
      </div>
      {selecting && (
        <div
          className="message-selection-bar"
          role="region"
          aria-label="Selected messages"
        >
          <label>
            <input
              disabled={!items.length}
              type="checkbox"
              checked={
                !!items.length &&
                items.slice(0, 100).every((item) => selected.has(item.id))
              }
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? new Set(items.slice(0, 100).map((item) => item.id))
                    : new Set(),
                )
              }
            />
            {items.length > 100 ? "Select first 100 loaded" : "Select all loaded"}
          </label>
          <span aria-live="polite">{selected.size} selected</span>
          <button
            type="button"
            className="secondary message-delete-button"
            disabled={!selected.size || deleting}
            onClick={() => {
              setDeleteError("");
              setToDelete([...selected]);
            }}
          >
            <Trash2 size={16} />
            Delete selected
          </button>
        </div>
      )}
      {toDelete && (
        <DeleteMessagesDialog
          count={toDelete.length}
          busy={deleting}
          error={deleteError}
          onCancel={() => {
            if (!deleting) setToDelete(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
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
                selecting={selecting}
                selected={selected.has(message.id)}
                selectionDisabled={!selected.has(message.id) && selected.size >= 100}
                menuOpen={openMenu === message.id}
                setOpenMenu={setOpenMenu}
                onSelect={() => choose(message.id)}
                onDelete={() => {
                  setDeleteError("");
                  setToDelete([message.id]);
                }}
                onCancel={() =>
                  api(`messages/${message.id}/cancel`, "POST").catch((e) =>
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
  "message.deleted": "Deleted saved messages",
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
  "device.error": "Our box reported an error",
  "device.recovered": "Our box recovered",
  "device.online": "Our little box came online",
  "device.offline": "Our little box went offline",
  "server.started": "Our little world started up",
  "server.stopped": "Our little world shut down",
};
export function ActivityPage({
  timezone,
  errors = 0,
}: {
  timezone: string;
  errors?: number;
}) {
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
      <details className="error-guide" open>
        <summary>Error code guide</summary>
        <p className="input-note">
          The LED matrix shows the lowest active code as a fixed E1–E8 display and resumes
          your animation when all errors clear. Disconnected errors are reported here
          after reconnection; the journal may miss events during power loss.
        </p>
        <dl className="error-codes">
          {deviceErrors.map((entry, bit) => (
            <div key={entry.code}>
              <dt>
                <strong>
                  {entry.code} · {entry.meaning}
                </strong>
                {(errors & (1 << bit)) !== 0 && <span> · Last reported active</span>}
              </dt>
              <dd>{entry.remedy}</dd>
            </div>
          ))}
        </dl>
      </details>
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
              <h3>
                {labels[entry.action] ?? entry.action}
                {(entry.action === "device.error" ||
                  entry.action === "device.recovered") &&
                  ` · ${entry.details.code}: ${errorLabel(entry.details.code)}`}
              </h3>
              <p>
                {entry.actorName}
                {entry.action === "message.deleted" &&
                  ` · ${entry.details.count} deleted`}
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
