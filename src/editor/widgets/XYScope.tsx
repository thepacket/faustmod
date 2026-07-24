import { useEffect, useRef } from "react";
import { Monitors, type XYScopeMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

/**
 * XY / vectorscope (Lissajous). Plots input x on the horizontal axis and y on the
 * vertical, one point per sample pair. Both inputs range 0…1: 0 = left/bottom edge,
 * 1 = right/top. Always square.
 */
export function XYScope({ node }: { node: WidgetNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The node box is kept square by the resize handle; use the smaller side to be safe.
  const size = Math.min(node.width ?? 160, node.height ?? 160);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const xs = new Float32Array(2048);
    const ys = new Float32Array(2048);
    let raf = 0;

    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Map a sample value in [0, 1] to a pixel coordinate; y is flipped (screen down).
    const px = (v: number) => v * size;
    const py = (v: number) => (1 - v) * size;

    const draw = () => {
      const m = Monitors.get(node.id) as XYScopeMonitor | undefined;
      ctx.clearRect(0, 0, size, size);

      // Grid (quadrants).
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const p = (i / 4) * size;
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
      }
      ctx.stroke();
      // Center cross-hair.
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(size / 2, 0);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(0, size / 2);
      ctx.lineTo(size, size / 2);
      ctx.stroke();

      if (m) {
        m.readX(xs);
        m.readY(ys);
        ctx.strokeStyle = "#57d977";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < xs.length; i++) {
          const x = px(xs[i]);
          const y = py(ys[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id, size]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: size, height: size }} />;
}
