import { useEffect, useState } from "react";
import { Monitors, type TunerMonitor } from "../../audio/monitors";
import { detectPitch } from "./pitch";
import type { WidgetNode } from "./WidgetBridge";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

interface Reading {
  note: string;
  cents: number;
  freq: number;
}

export function Tuner({ node }: { node: WidgetNode }) {
  const [r, setR] = useState<Reading | null>(null);

  useEffect(() => {
    const buf = new Float32Array(4096);
    const tick = () => {
      const m = Monitors.get(node.id) as TunerMonitor | undefined;
      if (!m) return setR(null);
      m.readTime(buf);
      const freq = detectPitch(buf, m.sampleRate());
      if (!freq || freq <= 0 || !isFinite(freq)) return setR(null);
      const midi = 69 + 12 * Math.log2(freq / 440);
      const near = Math.round(midi);
      const cents = (midi - near) * 100;
      const pc = ((near % 12) + 12) % 12;
      const note = `${NOTE_NAMES[pc]}${Math.floor(near / 12) - 1}`;
      setR({ note, cents, freq });
    };
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const cents = r ? Math.max(-50, Math.min(50, r.cents)) : 0;
  const inTune = r != null && Math.abs(r.cents) < 5;

  return (
    <div className={`tuner${inTune ? " in-tune" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <div className="tuner-note">{r ? r.note : "—"}</div>
      <div className="tuner-meter">
        <span className="tuner-tick flat">♭</span>
        <div className="tuner-bar">
          <div className="tuner-center" />
          <div className="tuner-needle" style={{ left: `${cents + 50}%` }} />
        </div>
        <span className="tuner-tick sharp">♯</span>
      </div>
      <div className="tuner-info">
        {r ? (
          <>
            <span className="tuner-cents">
              {r.cents > 0 ? "+" : ""}
              {r.cents.toFixed(0)}¢
            </span>
            <span className="tuner-freq">{r.freq.toFixed(1)} Hz</span>
          </>
        ) : (
          <span className="tuner-freq">listening…</span>
        )}
      </div>
    </div>
  );
}
