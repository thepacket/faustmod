import { useEffect, useRef } from "react";
import { Monitors, type ScopeMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

export function Scope({ node }: { node: WidgetNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = node.width ?? 280;
  const h = node.height ?? 150;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const sig = new Float32Array(2048);
    const trig = new Float32Array(2048);
    let raf = 0;

    const resize = () => {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = () => {
      const m = Monitors.get(node.id) as ScopeMonitor | undefined;
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += w / 8) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y <= h; y += h / 4) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
      // center line
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (m) {
        m.readSignal(sig);
        // Find a trigger offset for a stable image.
        let start = 0;
        const half = sig.length >> 1;
        if (m.hasTrigger()) {
          m.readTrigger(trig);
          for (let i = 1; i < half; i++) {
            if (trig[i - 1] <= 0.5 && trig[i] > 0.5) {
              start = i;
              break;
            }
          }
        } else {
          for (let i = 1; i < half; i++) {
            if (sig[i - 1] <= 0 && sig[i] > 0) {
              start = i;
              break;
            }
          }
        }
        const span = Math.min(sig.length - start, half);
        ctx.strokeStyle = "#57d977";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let i = 0; i < span; i++) {
          const x = (i / span) * w;
          const y = h / 2 - sig[start + i] * (h / 2) * 0.92;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id, w, h]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
