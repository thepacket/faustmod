import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { RecordMonitor } from "../../audio/recordUnit";
import { RecordBridge } from "./RecordBridge";
import type { WidgetNode } from "./WidgetBridge";

const HISTORY = 120; // level samples drawn in the strip (~1.4 s of audio)

/**
 * Record node body. The audio thread watches the "on" input and reports each crossing of
 * the 0 threshold as an event; this applies them in order, telling the app-level recorder
 * to start (non-zero) or stop (0). Playback stopping force-stops recording elsewhere
 * (App.togglePlay).
 *
 * Watching from the audio thread is what makes a short gate work: polling at 100 ms could
 * miss a trigger that opened and closed in between, and the level strip lost a column
 * every time a frame was late. Elapsed time counts on the audio clock for the same
 * reason. See recordUnit.ts.
 *
 * The strip and the clock exist so the recorder isn't an invisible process you have to
 * take on faith.
 */
export function RecordWidget({ node }: { node: WidgetNode }) {
  const [on, setOn] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let was = false;
    let startedAt = 0;
    let levels: number[] = [];
    const tick = () => {
      const m = Monitors.get(node.id) as RecordMonitor | undefined;
      for (const edge of m?.takeEdges?.() ?? []) {
        was = edge.on;
        startedAt = edge.on ? edge.t : 0;
        setOn(edge.on);
        RecordBridge.set(edge.on);
      }
      const active = !!m && was;
      const hist = m?.levels?.() ?? [];
      levels = hist.slice(-HISTORY).map((s) => Math.min(1, s.v));
      if (active && hist.length) setElapsed(Math.max(0, hist[hist.length - 1].t - startedAt));

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d")!;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = active ? "#ff5b6e" : "#4a5060";
      levels.forEach((v, i) => {
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
