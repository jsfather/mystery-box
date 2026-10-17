import { useState, useEffect } from "react";
import { LoaderCircle, Send } from "lucide-react";
export function MessageComposer({
  onSend,
  compact = false,
  defaultDuration = 120,
}: {
  onSend: (text: string, duration: number) => Promise<void>;
  compact?: boolean;
  defaultDuration?: number;
}) {
  const [text, setText] = useState(""),
    [duration, setDuration] = useState(defaultDuration),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setDuration(defaultDuration), [defaultDuration]);
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
      <p className="input-note">Latin letters & numbers · Long notes scroll.</p>
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
            {[...new Set([5, 15, 30, 60, 120, 300, defaultDuration])]
              .sort((a, b) => a - b)
              .map((v) => (
                <option key={v} value={v}>
                  {v < 60
                    ? `${v} seconds`
                    : `${v / 60} ${v === 60 ? "minute" : "minutes"}`}
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
