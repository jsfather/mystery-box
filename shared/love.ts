// An elapsed day is exactly 86,400 seconds, independent of DST/calendar changes.
export function elapsedLove(startAt: string, now: number) {
  const total = Math.max(0, Math.floor((now - Date.parse(startAt)) / 1000));
  return {
    total,
    days: Math.floor(total / 86400),
    hours: Math.floor(total / 3600) % 24,
    minutes: Math.floor(total / 60) % 60,
    seconds: total % 60,
  };
}
export function wallTime(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    calendar: "gregory",
    numberingSystem: "latn",
  }).formatToParts(new Date(instant));
  const value = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}`;
}
// Enumerate possible offsets around the requested day; reject DST gaps and
// make repeated wall times explicit instead of trusting the browser timezone.
export function momentFromWall(
  value: string,
  timezone: string,
  occurrence: "earlier" | "later" = "earlier",
) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value))
    throw new Error("Enter the date, time and seconds");
  const wall = value.length === 16 ? value + ":00" : value;
  const naive = Date.parse(wall + "Z");
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0, 19) !== wall)
    throw new Error("Choose a valid date and time");
  const offsets = new Set<number>();
  for (let h = -36; h <= 36; h += 6) {
    const sample = naive + h * 3600000;
    offsets.add(
      Date.parse(wallTime(new Date(sample).toISOString(), timezone) + "Z") - sample,
    );
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => wallTime(new Date(instant).toISOString(), timezone) === wall)
    .sort((a, b) => a - b);
  if (!matches.length)
    throw new Error(
      "This local time does not exist because of a daylight saving change. Choose another time.",
    );
  return new Date(matches[occurrence === "later" ? matches.length - 1 : 0]).toISOString();
}

export const loveFormats = {
  daysClock: "Days, hours, minutes & seconds",
  seconds: "Every second · total seconds",
  days: "Days together · total days",
  weeks: "Weeks & days together",
  hours: "Hours together · total hours",
  rotate: "A little of everything · rotate every 10 seconds",
} as const;
export function loveLine(startAt: string, now: number, format: keyof typeof loveFormats) {
  const e = elapsedLove(startAt, now);
  const pad = (v: number) => String(v).padStart(2, "0");
  if (format === "rotate")
    format = (["daysClock", "seconds", "weeks", "hours"] as const)[
      Math.floor(now / 10000) % 4
    ];
  switch (format) {
    case "seconds":
      return `${e.total} seconds`.length <= 16 ? `${e.total} seconds` : `${e.total}s`;
    case "days":
      return `${e.days} days of us`;
    case "weeks":
      return `${Math.floor(e.days / 7)}w ${e.days % 7}d ${pad(e.hours)}:${pad(e.minutes)}`;
    case "hours":
      return `${Math.floor(e.total / 3600)}h ${pad(e.minutes)}m ${pad(e.seconds)}s`;
    default:
      return `${e.days}d ${pad(e.hours)}:${pad(e.minutes)}:${pad(e.seconds)}`;
  }
}
export function storyVisible(s: import("./model.js").Settings, now: number) {
  if (!s.love.startAt) return false;
  if (s.displayMode === "love") return true;
  if (s.displayMode === "alternate") return Math.floor(now / 12000) % 2 === 1;
  // Fixed UTC intervals avoid daylight saving shifts; messages temporarily override.
  return (
    s.displayMode === "scheduled" &&
    (now / 1000) % (s.schedule.everyMinutes * 60) < s.schedule.durationSeconds
  );
}
