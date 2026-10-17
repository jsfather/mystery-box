const zones = Intl.supportedValuesOf("timeZone");
export function TimezoneSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (zone: string) => void;
}) {
  return (
    <select id={id} required value={value} onChange={(e) => onChange(e.target.value)}>
      {[...new Set(["UTC", ...zones, value])].sort().map((zone) => (
        <option key={zone} value={zone}>
          {zone.replaceAll("_", " ").replaceAll("/", " / ")}
        </option>
      ))}
    </select>
  );
}
