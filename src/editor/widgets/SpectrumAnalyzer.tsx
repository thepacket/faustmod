import { useEffect, useRef } from "react";
import { Monitors, type SpectrumMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

const F_MIN = 20;
const F_MAX = 20000;

/**
 * Real-time spectrum analyzer (RTA): instantaneous FFT magnitude vs. frequency on a
 * log axis from 20 Hz to 20 kHz, with a decaying peak-hold trace. Reads the shared
 * SpectrumMonitor (an AnalyserNode tap). Imperative canvas drawing (no setState).
 */
export function SpectrumAnalyzer({ node }: { node: WidgetNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const w = node.width ?? 300;
  const h = node.height ?? 160;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = w;
    canvas.height = h;
    const accent = getComputedStyle(canvas).getPropertyValue("--accent").trim() || "#4ade80";

    let buf: Uint8Array | null = null;
    let peaks: Float32Array | null = null;
    const ys = new Float32Array(w);
    let raf = 0;

    const draw = () => {
      const m = Monitors.get(node.id) as SpectrumMonitor | undefined;
      const nyquist = m ? m.sampleRate() / 2 : 22050;
      const fMax = Math.min(F_MAX, nyquist);
      const xForFreq = (f: number) => (Math.log(f / F_MIN) / Math.log(fMax / F_MIN)) * w;

      ctx.fillStyle = "#0a0c10";
      ctx.fillRect(0, 0, w, h);

      // Grid: octave-ish frequency lines + labels, and horizontal dB divisions.
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      for (let i = 1; i < 4; i++) {
        const y = (h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "9px system-ui, sans-serif";
      for (const [f, label] of [
        [100, "100"],
        [1000, "1k"],
        [10000, "10k"],
      ] as const) {
        if (f > fMax) continue;
        const x = xForFreq(f);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillText(label, x + 2, h - 3);
      }

      if (m) {
        const bins = m.binCount();
        if (!buf || buf.length !== bins) buf = new Uint8Array(bins);
        if (!peaks || peaks.length !== w) peaks = new Float32Array(w);
        m.readFreq(buf);

        for (let x = 0; x < w; x++) {
          const f = F_MIN * Math.pow(fMax / F_MIN, x / w);
          const bin = Math.min(bins - 1, Math.round((f / nyquist) * bins));
          const v = buf[bin] / 255;
          ys[x] = h - v * h;
          peaks[x] = v > peaks[x] ? v : Math.max(v, peaks[x] - 0.006);
        }

        // Filled spectrum with a gradient.
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x < w; x++) ctx.lineTo(x, ys[x]);
        ctx.lineTo(w - 1, h);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        // Bright spectrum line.
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x++) (x === 0 ? ctx.moveTo(0, ys[0]) : ctx.lineTo(x, ys[x]));
        ctx.stroke();

        // Decaying peak-hold trace.
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x < w; x++) {
          const y = h - peaks[x] * h;
          x === 0 ? ctx.moveTo(0, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id, w, h]);

  return <canvas className="spectro-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
