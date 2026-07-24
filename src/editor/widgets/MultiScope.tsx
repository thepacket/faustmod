import { useEffect, useRef } from "react";
import { Monitors } from "../../audio/monitors";
import type { TracesMonitor } from "../../audio/tableUnits";
import type { WidgetNode } from "./WidgetBridge";

const COLORS = ["#57d977", "#6ab7ff", "#ffb454", "#f783ac"];

/**
 * Four-channel oscilloscope. The single-trace scope can't show you a relationship —
 * carrier against modulator, or two sides of a filter — and this can. Channel 1 also
 * acts as the trigger, so the image holds still.
 */
export function MultiScope({ node }: { node: WidgetNode }) {
  const w = node.width ?? 260;
  const h = node.height ?? 140;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const buf = new Float32Array(2048);
    let raf = 0;

    const draw = () => {
      const m = Monitors.get(node.id) as TracesMonitor | undefined;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo((w * i) / 4, 0);
        ctx.lineTo((w * i) / 4, h);
      }
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (m?.readTrace) {
        // Trigger on channel 1's rising zero crossing so the traces stay aligned.
        m.readTrace(0, buf);
        let start = 0;
        const half = buf.length >> 1;
        for (let i = 1; i < half; i++) {
          if (buf[i - 1] <= 0 && buf[i] > 0) {
            start = i;
            break;
          }
        }
        const span = Math.min(buf.length - start, half);
        for (let t = 0; t < m.traceCount(); t++) {
          if (t > 0) m.readTrace(t, buf);
          ctx.strokeStyle = COLORS[t % COLORS.length];
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          for (let i = 0; i < span; i++) {
            const x = (i / span) * w;
            const y = h / 2 - buf[start + i] * (h / 2) * 0.9;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id, w, h]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
