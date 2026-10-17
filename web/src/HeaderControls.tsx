import { useEffect, useId, useRef, useState } from "react";
import { Sun, Moon, Monitor, Wifi, WifiOff } from "lucide-react";
import { ThemeControl, useAppearance } from "./Preferences";

export function HeaderConnection({ live }: { live: boolean }) {
  const text = live ? "Live connection" : "Reconnecting…";
  const Icon = live ? Wifi : WifiOff;
  return (
    <span
      className={`header-connection ${live ? "connected" : "reconnecting"}`}
      role="status"
      title={text}
    >
      <Icon size={17} aria-hidden="true" />
      <span>{text}</span>
    </span>
  );
}

export function MobileThemeButton() {
  const theme = useAppearance(),
    [open, setOpen] = useState(false),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLInputElement>("input:checked")
      ?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const focusOutside = (event: FocusEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("focusin", focusOutside);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("focusin", focusOutside);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="mobile-theme" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="mobile-theme-trigger"
        aria-label="Change appearance"
        aria-expanded={open}
        aria-controls={id}
        title={`Appearance: ${theme}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={18} />
      </button>
      {open && (
        <div id={id} className="mobile-theme-panel">
          <strong>Appearance</strong>
          <ThemeControl expanded />
          <p>System follows your device.</p>
        </div>
      )}
    </div>
  );
}
