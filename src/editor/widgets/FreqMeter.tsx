import { useEffect, useState } from "react";
import { Monitors, type TunerMonitor } from "../../audio/monitors";
import { detectPitch } from "./pitch";
import type { WidgetNode } from "./WidgetBridge";

/** Digital frequency meter: numeric readout of the input's fundamental (Hz / kHz). */
export function FreqMeter({ node }: { node: WidgetNode }) {
  const [freq, setFreq] = useState<number | null>(null);

  useEffect(() => {
    const buf = new Float32Array(4096);
    const tick = () => {
      const m = Monitors.get(node.id) as TunerMonitor | undefined;
      if (!m) return setFreq(null);
      m.readTime(buf);
      const f = detectPitch(buf, m.sampleRate());
      setFreq(f && isFinite(f) && f > 0 ? f : null);
    };
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const { value, unit } =
    freq == null
      ? { value: "— — —", unit: "Hz" }
      : freq >= 1000
        ? { value: (freq / 1000).toFixed(3), unit: "kHz" }
        : { value: freq.toFixed(1), unit: "Hz" };

  return (
    <div className="freqmeter" onPointerDown={(e) => e.stopPropagation()}>
      <span className="freqmeter-value">{value}</span>
      <span className="freqmeter-unit">{unit}</span>
    </div>
  );
}
