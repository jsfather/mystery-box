import { useId, useRef } from "react";
import { Search, X } from "lucide-react";

export function MessageSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  return (
    <div className="message-search" role="search" aria-label="Search our conversation">
      <label className="visually-hidden" htmlFor={id}>
        Search messages
      </label>
      <Search size={18} aria-hidden="true" />
      <input
        ref={input}
        id={id}
        type="search"
        placeholder="Search our conversation"
        autoComplete="off"
        spellCheck={false}
        maxLength={160}
        value={value}
        aria-controls="conversation-messages"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            onChange("");
          }
        }}
      />
      {value && (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear message search"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
