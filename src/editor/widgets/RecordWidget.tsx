import { useEffect, useState } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import { RecordBridge } from "./RecordBridge";
import type { WidgetNode } from "./WidgetBridge";

/**
 * Record node body. Polls its "on" input (an AnalyserNode tap) and, on a change
 * across the 0 threshold, tells the app-level recorder to start (non-zero) or stop
 * (0). Playback stopping force-stops recording elsewhere (App.togglePlay).
 */
export function RecordWidget({ node }: { node: WidgetNode }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let was = false;
    const tick = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const active = !!m && m.level() > 1e-3;
      if (active !== was) {
        was = active;
        setOn(active);
        RecordBridge.set(active);
      }
    };
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [node.id]);

  return (
    <div className="record-widget">
      <span className={`rec-dot ${on ? "on" : ""}`} />
      <span className="rec-state">{on ? "REC" : "idle"}</span>
    </div>
  );
}
