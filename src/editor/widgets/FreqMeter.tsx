import { useEffect, useState } from "react";
import { Monitors, type TunerMonitor } from "../../audio/monitors";
import { detectFrequency, detectFrequencyFFT } from "./pitch";
import type { WidgetNode } from "./WidgetBridge";

/**
 * Digital frequency meter. Reciprocal period counting (like a hardware counter) is
 * exact at low/mid frequencies; near Nyquist it fails (too few samples per period at
 * the sample-rate clock), so above ~4 kHz — or when the two disagree — we fall back to
 * the FFT-peak estimate, which stays accurate across the whole 20 Hz – 20 kHz range.
 */
export function FreqMeter({ node }: { node: WidgetNode }) {
  const [freq, setFreq] = useState<number | null>(null);

  useEffect(() => {
    const time = new Float32Array(8192);
    let fdb: Float32Array | null = null;
    const tick = () => {
      const m = Monitors.get(node.id) as TunerMonitor | undefined;
      if (!m) return setFreq(null);
      m.readTime(time);
      const rec = detectFrequency(time, m.sampleRate());
      const bins = m.binCount();
      if (!fdb || fdb.length !== bins) fdb = new Float32Array(bins);
      m.readFreqDb(fdb);
      const fft = detectFrequencyFFT(fdb, m.sampleRate() / (2 * bins));
      let f: number | null;
      if (rec != null && rec < 4000 && (fft == null || Math.abs(rec - fft) / fft < 0.1)) {
        f = rec; // reciprocal is most precise here and agrees with the FFT
      } else {
        f = fft ?? rec;
      }
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
