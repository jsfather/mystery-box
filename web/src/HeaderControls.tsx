import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Sun, Moon, Monitor, Wifi, WifiOff } from "lucide-react";
import type { Snapshot } from "../../shared/model";
import { ThemeControl, useAppearance } from "./Preferences";

function HeaderPopover({
  label,
  icon,
  children,
  hover = false,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  hover?: boolean;
}) {
  const [open, setOpen] = useState(false),
    id = useId();
  const root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const pinned = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    if (!open) return;
    const close = () => {
      pinned.current = false;
      setOpen(false);
    };
    const outside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="header-popover"
      ref={root}
      onPointerEnter={(event) => {
        if (hover && event.pointerType === "mouse") {
          clearTimer();
          setOpen(true);
        }
      }}
      onPointerLeave={() => {
        if (hover && !pinned.current)
          timer.current = setTimeout(() => setOpen(false), 180);
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="header-control"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          clearTimer();
          const next = hover ? !pinned.current : !open;
          pinned.current = next;
          setOpen(next);
        }}
      >
        {icon}
      </button>
      {open && (
        <div id={id} className="header-control-panel" role="region" aria-label={label}>
          <strong>{label}</strong>
          {children}
        </div>
      )}
    </div>
  );
}

export function HeaderConnection({
  live,
  snapshot,
}: {
  live: boolean;
  snapshot: Snapshot | null;
}) {
  const Icon = live ? Wifi : WifiOff;
  const device = snapshot?.device;
  const lastSeen = device?.lastSeen
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: snapshot?.settings.timezone,
        dateStyle: "medium",
        timeStyle: "medium",
      }).format(new Date(device.lastSeen))
    : "No heartbeat yet";
  return (
    <HeaderPopover
      label="Connection"
      icon={<Icon size={18} className={live ? "connection-live" : ""} />}
      hover
    >
      <dl className="connection-details" aria-live="polite">
        <div>
          <dt>App connection</dt>
          <dd>{live ? "Live" : "Reconnecting…"}</dd>
        </div>
        <div>
          <dt>MQTT broker</dt>
          <dd>
            {snapshot ? (snapshot.broker ? "Connected" : "Disconnected") : "Waiting…"}
          </dd>
        </div>
        <div>
          <dt>Mystery box</dt>
          <dd>{device?.online ? "Online" : "Waiting for device"}</dd>
        </div>
        <div>
          <dt>Last heartbeat</dt>
          <dd>{lastSeen}</dd>
        </div>
        {device?.rssi != null && (
          <div>
            <dt>Wi-Fi signal</dt>
            <dd>{device.rssi} dBm</dd>
          </div>
        )}
        {device?.firmware && (
          <div>
            <dt>Firmware</dt>
            <dd>{device.firmware}</dd>
          </div>
        )}
      </dl>
      <p>Heartbeat time uses {snapshot?.settings.timezone ?? "your box’s timezone"}.</p>
    </HeaderPopover>
  );
}

export function AppearanceButton() {
  const theme = useAppearance();
  const Icon = theme === "system" ? Monitor : theme === "dark" ? Moon : Sun;
  return (
    <HeaderPopover label="Appearance" icon={<Icon size={18} />}>
      <ThemeControl expanded />
      <p>System follows your device.</p>
    </HeaderPopover>
  );
}
