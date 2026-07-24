import { useEffect, useRef, useState } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import { RecordBridge } from "./RecordBridge";
import type { WidgetNode } from "./WidgetBridge";

const HISTORY = 120; // level samples kept for the strip (~12 s at the poll rate)

/**
 * Record node body. Polls its "on" input (an AnalyserNode tap) and, on a change
 * across the 0 threshold, tells the app-level recorder to start (non-zero) or stop
 * (0). Playback stopping force-stops recording elsewhere (App.togglePlay).
 *
 * While recording it also draws a scrolling level strip and an elapsed clock, so the
 * recorder isn't an invisible process you have to take on faith.
 */
export function RecordWidget({ node }: { node: WidgetNode }) {
  const [on, setOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);

  useEffect(() => {
    let was = false;
    let startedAt = 0;
    const tick = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const level = m ? m.level() : 0;
      const active = !!m && level > 1e-3;
      if (active !== was) {
        was = active;
        startedAt = active ? performance.now() : 0;
        history.current = [];
        setOn(active);
        RecordBridge.set(active);
      }
      if (active) {
        history.current.push(Math.min(1, level));
        if (history.current.length > HISTORY) history.current.shift();
        setElapsed((performance.now() - startedAt) / 1000);
      }

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = active ? "#ff5b6e" : "#4a5060";
      history.current.forEach((v, i) => {
        const bh = Math.max(1, v * h);
        ctx.fillRect((i / HISTORY) * w, (h - bh) / 2, Math.max(1, w / HISTORY - 1), bh);
      });
    };
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [node.id]);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);

  return (
    <div className="record-widget">
      <div className="rec-head">
        <span className={`rec-dot ${on ? "on" : ""}`} />
        <span className="rec-state">{on ? "REC" : "idle"}</span>
        <span className="rec-time">{`${mm}:${String(ss).padStart(2, "0")}`}</span>
      </div>
      <canvas className="rec-strip" ref={canvasRef} width={120} height={22} />
    </div>
  );
}
