import { useEffect, useRef } from "react";
import { Monitors } from "../../audio/monitors";
import type { SpectrogramMonitor } from "../../audio/spectrogramUnit";
import type { WidgetNode } from "./WidgetBridge";

/** Intensity 0..1 → heat colour (black → red → yellow → white). */
function heat(v: number): string {
  const r = Math.min(255, v * 3 * 255);
  const g = Math.min(255, Math.max(0, v * 3 - 1) * 255);
  const b = Math.min(255, Math.max(0, v * 3 - 2) * 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

/**
 * Scrolling waterfall of the spectrum over time.
 *
 * The columns are computed in the audio thread (spectrogramUnit.ts) and pushed here; this
 * only scrolls the canvas and paints whatever arrived. That is the difference between a
 * waterfall and a hole in one: a dropped frame used to mean a column that was never
 * computed, and there was no way to get it back. Now a stall just means several columns
 * are drawn at once when the tab wakes up.
 */
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
    let raf = 0;

    const draw = () => {
      const m = Monitors.get(node.id) as SpectrogramMonitor | undefined;
      // A backlog longer than the canvas can only fill it, so drop what would scroll
      // straight off the left edge.
      const cols = (m?.take?.() ?? []).slice(-w);
      if (cols.length) {
        const n = cols.length;
        ctx.drawImage(canvas, -n, 0);
        // Only the lower ~60% of the spectrum is worth the pixels; above that a musical
        // signal is almost always empty.
        const shown = Math.floor((m?.bins?.() ?? 512) * 0.6);
        cols.forEach((col, i) => {
          const x = w - n + i;
          for (let y = 0; y < h; y++) {
            const bin = Math.floor(((h - 1 - y) / h) * shown);
            ctx.fillStyle = heat(col[bin] / 255);
            ctx.fillRect(x, y, 1, 1);
          }
        });
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
