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
