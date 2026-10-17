import { useState } from "react";
import { Check, Clock3, Ellipsis, Monitor, RotateCcw, X } from "lucide-react";
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
}) {
  const [options, setOptions] = useState(false);
  const pending = !message.cancelled && message.expiresAt > now;
  const waiting = pending && message.startsAt > now;
  const StatusIcon = waiting ? Clock3 : Monitor;
  return (
    <article
      className={`chat-message ${own ? "own" : "partner"}${grouped ? " grouped" : ""}${animate ? " arriving" : ""}`}
      aria-label={`Message from ${message.authorName ?? "Before accounts"}`}
    >
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
          <button
            type="button"
            className="chat-options"
            aria-label={`Message options: ${message.text}`}
            aria-expanded={options}
            aria-controls={`actions-${message.id}`}
            onClick={() => setOptions((value) => !value)}
          >
            <Ellipsis size={18} />
          </button>
        </div>
        {pending && (
          <div className={`chat-status ${waiting ? "waiting" : "active"}`}>
            <StatusIcon size={12} />
            {waiting ? "Queued for our box" : "Display window active"}
          </div>
        )}
        {message.cancelled && <div className="chat-status">LCD display cancelled</div>}
        {options && (
          <div id={`actions-${message.id}`} className="chat-action-list">
            <button
              type="button"
              onClick={() => {
                onReplay();
                setOptions(false);
              }}
            >
              <RotateCcw size={14} />
              Show on box again
            </button>
            {pending && (
              <button
                type="button"
                onClick={() => {
                  onCancel();
                  setOptions(false);
                }}
              >
                <X size={14} />
                Cancel LCD display
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
