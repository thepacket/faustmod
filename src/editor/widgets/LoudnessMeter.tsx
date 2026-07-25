import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { StereoAnalysisMonitor } from "../../audio/loudnessUnit";
import type { WidgetNode } from "./WidgetBridge";

const FLOOR = -40; // bottom of the scale, LUFS

/**
 * Momentary loudness and sample peak for the stereo bus. Peak tells you about clipping,
 * LUFS tells you how loud it will actually sound — the number every delivery target is
 * specified in, and the one an RMS meter can't give you.
 *
 * Both are measured in the audio thread (loudnessUnit.ts) and pushed here, so the peak is
 * a real peak over every sample rather than a sample of whatever the poll happened to
 * catch. Reading drains the held peak, so nothing between two polls is missed.
 */
export function LoudnessMeter({ node }: { node: WidgetNode }) {
  const w = node.width ?? 130;
  const h = node.height ?? 56;
  const [lufs, setLufs] = useState(-70);
  const [peakDb, setPeakDb] = useState(-70);
  const maxRef = useRef(-70);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as StereoAnalysisMonitor | undefined;
      if (!m?.lufs) return;
      const l = m.lufs();
      const p = m.peak();
      const pdb = p <= 1e-6 ? -70 : 20 * Math.log10(p);
      setLufs(l);
      setPeakDb(pdb);
      if (pdb > maxRef.current) maxRef.current = pdb;
    }, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const barPct = Math.max(0, Math.min(1, (lufs - FLOOR) / (0 - FLOOR))) * 100;

  return (
    <div className="loudness" style={{ width: w, height: h }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="loud-row">
        <span className="loud-label">LUFS</span>
        <span className="loud-val">{lufs <= -69 ? "-inf" : lufs.toFixed(1)}</span>
      </div>
      <div className="loud-bar">
        <div className="loud-fill" style={{ width: `${barPct.toFixed(1)}%` }} />
      </div>
      <div className="loud-row">
        <span className="loud-label">peak</span>
        <span className={`loud-val${peakDb > -0.1 ? " hot" : ""}`}>
          {peakDb <= -69 ? "-inf" : peakDb.toFixed(1)} dB
        </span>
      </div>
    </div>
  );
}
