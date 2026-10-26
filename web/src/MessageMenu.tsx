import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, RotateCcw, Trash2, X } from "lucide-react";
import "./message-actions.css";

export function MessageMenu({
  id,
  trigger,
  pending,
  close,
  replay,
  cancel,
  select,
  remove,
}: {
  id: string;
  trigger: HTMLButtonElement;
  pending: boolean;
  close: (focus?: boolean) => void;
  replay: () => void;
  cancel: () => void;
  select: () => void;
  remove: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });
  useLayoutEffect(() => {
    const menu = root.current!;
    const box = trigger.getBoundingClientRect(),
      bounds = menu.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(box.right - bounds.width, window.innerWidth - bounds.width - 12),
    );
    const below = box.bottom + 6;
    const top = Math.max(
      12,
      below + bounds.height < window.innerHeight - 12
        ? below
        : box.top - bounds.height - 6,
    );
    setPosition({ left, top, visible: true });
    const outside = (event: Event) => {
      if (!menu.contains(event.target as Node) && !trigger.contains(event.target as Node))
        close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const scroll = (event: Event) => {
      if (!menu.contains(event.target as Node)) close();
    };
    const resize = () => close();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [trigger, close]);
  useLayoutEffect(() => {
    if (position.visible)
      root.current
        ?.querySelector<HTMLButtonElement>("button")
        ?.focus({ preventScroll: true });
  }, [position.visible]);
  const action = (fn: () => void) => {
    close(true);
    fn();
  };
  return createPortal(
    <div
      ref={root}
      id={id}
      role="menu"
      aria-label="Message actions"
      className="message-menu"
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible ? "visible" : "hidden",
      }}
      onKeyDown={(event) => {
        const buttons = [
          ...root.current!.querySelectorAll<HTMLButtonElement>("[role=menuitem]"),
        ];
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next].focus();
        }
        if (event.key === "Tab") close(true);
      }}
    >
      <span className="message-menu-label" aria-hidden="true">
        MESSAGE ACTIONS
      </span>
      <button role="menuitem" onClick={() => action(replay)}>
        <RotateCcw size={16} />
        Show on box again
      </button>
      {pending && (
        <button role="menuitem" onClick={() => action(cancel)}>
          <X size={16} />
          Stop LCD display
        </button>
      )}
      <button role="menuitem" onClick={() => action(select)}>
        <CheckSquare size={16} />
        Select message
      </button>
      <div role="separator" />
      <button
        role="menuitem"
        className="message-menu-delete"
        onClick={() => action(remove)}
      >
        <Trash2 size={16} />
        Delete message…
      </button>
    </div>,
    document.body,
  );
}
