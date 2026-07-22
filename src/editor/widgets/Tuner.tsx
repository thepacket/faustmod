import { useEffect, useState } from "react";
import { Monitors, type TunerMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * YIN pitch detection (de Cheveigné & Kawahara). The cumulative-mean-normalized
 * difference function robustly picks the fundamental period, avoiding the octave
 * errors that plain autocorrelation suffers on pure tones.
 */
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.01) return null; // too quiet / silent

  const maxLag = Math.min(Math.floor(sampleRate / 30), n >> 1); // down to 30 Hz
  const minLag = Math.floor(sampleRate / 2000); // up to 2 kHz
  const W = n - maxLag; // fixed comparison window for every lag (no length bias)

  // Difference function d(lag) = Σ (buf[i] − buf[i+lag])².
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + lag];
      sum += diff * diff;
    }
    d[lag] = sum;
  }
  // Cumulative mean normalized difference: d'(lag) = d(lag)·lag / Σ_{1..lag} d.
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    cmnd[lag] = running > 0 ? (d[lag] * lag) / running : 1;
  }
  // First lag below the threshold that is a local minimum → the fundamental period.
  const threshold = 0.15;
  let tau = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < threshold) {
      while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
      tau = lag;
      break;
    }
  }
  if (tau === -1) {
    // Nothing below threshold: fall back to the global minimum of the CMNDF.
    let best = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (cmnd[lag] < best) {
        best = cmnd[lag];
        tau = lag;
      }
    }
    if (tau <= 0 || best > 0.4) return null; // no clear pitch
  }
  // Parabolic interpolation on the difference function for sub-sample accuracy.
  const x0 = tau > 1 ? d[tau - 1] : d[tau];
  const x2 = tau + 1 <= maxLag ? d[tau + 1] : d[tau];
  const denom = 2 * (2 * d[tau] - x2 - x0);
  const shift = denom !== 0 ? Math.max(-1, Math.min(1, (x2 - x0) / denom)) : 0;
  const period = tau + shift;
  return period > 0 ? sampleRate / period : null;
}

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
