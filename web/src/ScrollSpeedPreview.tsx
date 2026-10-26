import { useEffect, useState } from "react";
const sample = "A little note, at your own pace.    ";
export function ScrollSpeedPreview({ stepMs }: { stepMs: number }) {
  const [position, setPosition] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setPosition((old) => (old + 1) % sample.length),
      stepMs,
    );
    return () => clearInterval(timer);
  }, [stepMs]);
  return (
    <div className="reading-preview">
      <span>LIVE READING PREVIEW</span>
      <div aria-label="LCD scrolling preview">
        <code>{(sample + sample).slice(position, position + 16)}</code>
      </div>
    </div>
  );
}
