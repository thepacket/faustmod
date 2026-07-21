import { useEffect, useRef } from "react";
import { Monitors, type SpectrumMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

/** Intensity 0..1 → heat colour (black → red → yellow → white). */
function heat(v: number): string {
  const r = Math.min(255, v * 3 * 255);
  const g = Math.min(255, Math.max(0, v * 3 - 1) * 255);
  const b = Math.min(255, Math.max(0, v * 3 - 2) * 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function Spectrogram({ node }: { node: WidgetNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = node.width ?? 280;
  const h = node.height ?? 150;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    let buf: Uint8Array | null = null;
    let raf = 0;

    const draw = () => {
      const m = Monitors.get(node.id) as SpectrumMonitor | undefined;
      // Scroll left by 1px.
      ctx.drawImage(canvas, -1, 0);
      // New column on the right.
      if (m) {
        const bins = m.binCount();
        if (!buf || buf.length !== bins) buf = new Uint8Array(bins);
        m.readFreq(buf);
        // Only show up to ~half the spectrum (more useful range).
        const shown = Math.floor(bins * 0.6);
        for (let y = 0; y < h; y++) {
          const bin = Math.floor(((h - 1 - y) / h) * shown);
          const v = buf[bin] / 255;
          ctx.fillStyle = heat(v);
          ctx.fillRect(w - 1, y, 1, 1);
        }
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(w - 1, 0, 1, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id, w, h]);

  return (
    <canvas className="spectro-canvas" ref={canvasRef} style={{ width: w, height: h }} />
  );
}
