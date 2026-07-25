import { useEffect, useRef } from "react";
import { Monitors } from "../../audio/monitors";
import type { StereoAnalysisMonitor } from "../../audio/loudnessUnit";
import type { WidgetNode } from "./WidgetBridge";

/**
 * Phase correlation of the stereo bus: +1 is mono-compatible, 0 is wide, negative means
 * the channels fight and the mix will partly vanish in mono. The needle is the value;
 * the red zone is where you should worry.
 */
export function CorrelationMeter({ node }: { node: WidgetNode }) {
  const w = node.width ?? 150;
  const h = node.height ?? 42;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let smoothed = 0;

    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as StereoAnalysisMonitor | undefined;
      const c = m?.correlation ? m.correlation() : 0;
      smoothed += (c - smoothed) * 0.25; // ballistics, so the needle is readable
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      // Scale: -1 at the left, 0 centre, +1 right. Left half tinted as the danger zone.
      ctx.fillStyle = "rgba(255,91,110,0.12)";
      ctx.fillRect(0, 0, w / 2, h);
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        ctx.moveTo(t * w, h - 10);
        ctx.lineTo(t * w, h);
      }
      ctx.stroke();
      const x = ((smoothed + 1) / 2) * w;
      ctx.strokeStyle = smoothed < 0 ? "#ff5b6e" : "#46d19e";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x, h - 10);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(smoothed.toFixed(2), 4, 11);
      ctx.fillText("-1", 2, h - 1);
      ctx.fillText("+1", w - 14, h - 1);
    }, 60);
    return () => window.clearInterval(timer);
  }, [node.id, w, h]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
