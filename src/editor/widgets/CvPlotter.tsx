import { useEffect, useRef } from "react";
import { Monitors } from "../../audio/monitors";
import type { TracesMonitor } from "../../audio/tableUnits";
import type { WidgetNode } from "./WidgetBridge";

const COLORS = ["#57d977", "#6ab7ff", "#ffb454", "#f783ac"];
const HISTORY = 240; // samples of history, one per poll

/**
 * Scrolling plot of slow control signals — LFOs, envelopes, sequencer CV. An audio
 * scope shows 40 ms at a time, which is useless for something that moves over seconds;
 * this samples at control rate and keeps a rolling window.
 */
export function CvPlotter({ node }: { node: WidgetNode }) {
  const w = node.width ?? 220;
  const h = node.height ?? 90;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[][]>([[], [], [], []]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as TracesMonitor | undefined;
      const count = m?.traceCount ? m.traceCount() : 0;
      for (let t = 0; t < 4; t++) {
        const v = t < count && m ? m.value(t) : 0;
        const hist = history.current[t];
        hist.push(v);
        if (hist.length > HISTORY) hist.shift();
      }

      // Autoscale to what's actually in view, so both 0..1 gates and Hz-scale CV read.
      let lo = 0;
      let hi = 1;
      for (const hist of history.current) {
        for (const v of hist) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      const span = hi - lo || 1;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, h - ((0 - lo) / span) * h);
      ctx.lineTo(w, h - ((0 - lo) / span) * h);
      ctx.stroke();

      history.current.forEach((hist, t) => {
        if (hist.length < 2) return;
        ctx.strokeStyle = COLORS[t % COLORS.length];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        hist.forEach((v, i) => {
          const x = (i / (HISTORY - 1)) * w;
          const y = h - ((v - lo) / span) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });

      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(hi.toFixed(2), 3, 10);
      ctx.fillText(lo.toFixed(2), 3, h - 3);
    }, 50);
    return () => window.clearInterval(timer);
  }, [node.id, w, h]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
