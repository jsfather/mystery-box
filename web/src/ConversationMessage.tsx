import { useCallback, useRef } from "react";
import { MessageMenu } from "./MessageMenu";
import { Check, Clock3, Ellipsis, Monitor } from "lucide-react";
import type { Message } from "../../shared/model";

export function ConversationMessage({
  message,
  own,
  grouped,
  animate,
  now,
  time,
  timestamp,
  onCancel,
  onReplay,
  onDelete,
  onSelect,
  selecting,
  selected,
  selectionDisabled,
  menuOpen,
  setOpenMenu,
}: {
  message: Message;
  own: boolean;
  grouped: boolean;
  animate: boolean;
  now: number;
  time: string;
  timestamp: string;
  onCancel: () => void;
  onReplay: () => void;
  onDelete: () => void;
  onSelect: () => void;
  selecting: boolean;
  selected: boolean;
  selectionDisabled: boolean;
  menuOpen: boolean;
  setOpenMenu: (id: string | null) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(
    (focus = false) => {
      setOpenMenu(null);
      if (focus) trigger.current?.focus({ preventScroll: true });
    },
    [setOpenMenu],
  );
  const pending = !message.cancelled && message.expiresAt > now;
  const waiting = pending && message.startsAt > now;
  const StatusIcon = waiting ? Clock3 : Monitor;
  return (
    <article
      className={`chat-message ${own ? "own" : "partner"}${grouped ? " grouped" : ""}${animate ? " arriving" : ""}`}
      aria-label={`Message from ${message.authorName ?? "Before accounts"}`}
    >
      {selecting && (
        <label className="message-select">
          <input
            id={`select-${message.id}`}
            type="checkbox"
            checked={selected}
            disabled={selectionDisabled}
            aria-label={`Select message: ${message.text}`}
            onChange={onSelect}
          />
        </label>
      )}
      <div className="chat-avatar" aria-hidden="true">
        {(message.authorName ?? "Us").slice(0, 1)}
      </div>
      <div className="chat-content">
        {!grouped && (
          <div className="chat-meta">
            <strong>
              {message.authorName ?? "Before accounts"}
              {own && <span> · You</span>}
            </strong>
          </div>
        )}
        <div className="bubble-row">
          <div className="chat-bubble">
            <p>{message.text}</p>
            <div className="bubble-meta">
              <time
                dateTime={new Date(message.createdAt).toISOString()}
                title={timestamp}
              >
                {time}
              </time>
              <Check size={12} aria-label="Saved to our conversation" />
            </div>
          </div>
          {!selecting && (
            <button
              ref={trigger}
              type="button"
              className="chat-options"
              aria-label={`Message options: ${message.text}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-controls={menuOpen ? `actions-${message.id}` : undefined}
              onClick={() => setOpenMenu(menuOpen ? null : message.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setOpenMenu(message.id);
                }
              }}
            >
              <Ellipsis size={18} />
            </button>
          )}
        </div>
        {pending && (
          <div className={`chat-status ${waiting ? "waiting" : "active"}`}>
            <StatusIcon size={12} />
            {waiting ? "Queued for our box" : "Display window active"}
          </div>
        )}
        {message.cancelled && <div className="chat-status">LCD display cancelled</div>}
        {menuOpen && trigger.current && (
          <MessageMenu
            id={`actions-${message.id}`}
            trigger={trigger.current}
            pending={pending}
            close={closeMenu}
            replay={onReplay}
            cancel={onCancel}
            select={onSelect}
            remove={onDelete}
          />
        )}
      </div>
    </article>
  );
}
