import { useEffect, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { HealthMonitor } from "../../audio/healthUnit";
import type { WidgetNode } from "./WidgetBridge";

/**
 * Did the *audio* actually break, or did the UI just stop looking?
 *
 * Every other meter in FaustMod samples on the main thread, so a background tab makes
 * them report gaps that the audio never had. This one counts late render callbacks on
 * the audio thread itself: if the number climbs while you switch tabs, the render thread
 * is genuinely missing its deadline (raise the buffer size in Settings). If it stays
 * put while the CV Plotter shows red stall bands, the audio was fine all along.
 */
export function AudioHealth({ node }: { node: WidgetNode }) {
  const [s, setS] = useState({ gaps: 0, worstMs: 0, periodMs: 0, quanta: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as HealthMonitor | undefined;
      if (m?.stats) setS(m.stats());
    }, 200);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const idle = s.quanta === 0;
  return (
    <div className="health" onPointerDown={(e) => e.stopPropagation()}>
      <div className="health-row">
        <span className="health-label">dropouts</span>
        <span className={`health-val${s.gaps > 0 ? " bad" : ""}`}>{idle ? "—" : s.gaps}</span>
      </div>
      <div className="health-row">
        <span className="health-label">worst</span>
        <span className={`health-val${s.gaps > 0 ? " bad" : ""}`}>
          {idle || !s.worstMs ? "—" : `${s.worstMs.toFixed(0)} ms`}
        </span>
      </div>
      <div className="health-row">
        <span className="health-label">buffer</span>
        <span className="health-val dim">
          {s.periodMs ? `${s.periodMs.toFixed(1)} ms` : "—"}
        </span>
      </div>
      <button
        className="health-reset"
        onClick={() => (Monitors.get(node.id) as HealthMonitor | undefined)?.reset?.()}
        title="Zero the counters"
      >
        reset
      </button>
    </div>
  );
}
