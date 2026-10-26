import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
export function DeleteMessagesDialog({
  count,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement;
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="delete-messages-dialog"
      aria-labelledby="delete-messages-title"
      aria-describedby="delete-messages-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <span className="delete-dialog-icon">
        <Trash2 size={24} />
      </span>
      <h2 id="delete-messages-title">
        Delete {count === 1 ? "this message" : `${count} messages`}?
      </h2>
      <p id="delete-messages-description">
        This permanently removes {count === 1 ? "the message" : "these messages"} from
        your shared conversation for both accounts and stops any remaining LCD display.
        This cannot be undone.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="delete-dialog-actions">
        <button
          ref={cancel}
          type="button"
          className="secondary"
          disabled={busy}
          onClick={onCancel}
        >
          Keep {count === 1 ? "message" : "messages"}
        </button>
        <button
          type="button"
          className="primary danger"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "Deleting…" : `Delete ${count === 1 ? "message" : count + " messages"}`}
        </button>
      </div>
    </dialog>
  );
}
