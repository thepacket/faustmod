import { useEffect, useRef } from "react";
import { Monitors } from "../../audio/monitors";
import type { TracesMonitor } from "../../audio/tableUnits";
import type { WidgetNode } from "./WidgetBridge";

const COLORS = ["#57d977", "#6ab7ff", "#ffb454", "#f783ac"];
const WINDOW_MS = 12000; // how much history the width represents
const POLL_MS = 50;

interface Sample {
  t: number; // performance.now() when it was read
  v: number;
}

/**
 * Scrolling plot of slow control signals — LFOs, envelopes, sequencer CV. An audio
 * scope shows 40 ms at a time, which is useless for something that moves over seconds;
 * this samples at control rate and keeps a rolling window.
 *
 * Each channel reports the *mean* of its window, so an audio-rate signal reads ~0: this
 * is a CV plotter, not a scope. Channels that never leave zero (unconnected, or silent
 * audio) are skipped rather than drawn as identical flat lines stacked on the baseline,
 * and every live channel gets a colour-coded readout, so overlapping traces can still
 * be told apart.
 *
 * Samples are plotted against the clock, not against their index. Polling happens on the
 * main thread, so a busy or backgrounded tab delivers them at irregular intervals; drawing
 * those evenly would put kinks and flat spots into a signal that is actually clean, and
 * make the plotter blame the audio for its own scheduling. On a real time axis a stall
 * shows up honestly, as a long straight segment between two distant samples.
 */
export function CvPlotter({ node }: { node: WidgetNode }) {
  const w = node.width ?? 220;
  const h = node.height ?? 90;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<Sample[][]>([[], [], [], []]);

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
      const now = performance.now();
      const cutoff = now - WINDOW_MS;
      for (let t = 0; t < 4; t++) {
        const v = t < count && m ? m.value(t) : 0;
        const hist = history.current[t];
        hist.push({ t: now, v });
        while (hist.length && hist[0].t < cutoff) hist.shift();
      }

      // A channel pinned at exactly zero is either unconnected or silent; drawing it
      // would put identical flat lines on the baseline and hide the live ones.
      const live = history.current.map((hist) => hist.some((s) => s.v !== 0));

      // Autoscale to what's actually in view, so both 0..1 gates and Hz-scale CV read.
      let lo = 0;
      let hi = 1;
      history.current.forEach((hist, t) => {
        if (!live[t]) return;
        for (const s of hist) {
          if (s.v < lo) lo = s.v;
          if (s.v > hi) hi = s.v;
        }
      });
      const span = hi - lo || 1;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, h - ((0 - lo) / span) * h);
      ctx.lineTo(w, h - ((0 - lo) / span) * h);
      ctx.stroke();

      // x is elapsed time, so irregular polling stretches the spacing instead of
      // distorting the shape.
      const xAt = (t: number) => w - ((now - t) / WINDOW_MS) * w;
      history.current.forEach((hist, ch) => {
        if (hist.length < 2 || !live[ch]) return;
        ctx.strokeStyle = COLORS[ch % COLORS.length];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        hist.forEach((s, i) => {
          const x = xAt(s.t);
          const y = h - ((s.v - lo) / span) * h;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      });

      // Mark stalls: a gap far longer than the poll interval means the main thread was
      // blocked or the tab was backgrounded, and nothing was sampled in between.
      const ref = history.current.find((hist, ch) => live[ch] && hist.length > 1);
      if (ref) {
        ctx.fillStyle = "rgba(255,91,110,0.16)";
        for (let i = 1; i < ref.length; i++) {
          const dt = ref[i].t - ref[i - 1].t;
          if (dt < POLL_MS * 4) continue;
          ctx.fillRect(xAt(ref[i - 1].t), 0, xAt(ref[i].t) - xAt(ref[i - 1].t), h);
        }
      }

      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.textAlign = "left";
      ctx.fillText(hi.toFixed(2), 3, 10);
      ctx.fillText(lo.toFixed(2), 3, h - 3);

      // Current value per live channel, in its own colour: overlapping traces are
      // indistinguishable on their own.
      ctx.textAlign = "right";
      let row = 10;
      history.current.forEach((hist, ch) => {
        if (!live[ch] || hist.length === 0) return;
        const v = hist[hist.length - 1].v;
        ctx.fillStyle = COLORS[ch % COLORS.length];
        ctx.fillText(`${ch + 1}: ${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(3)}`, w - 3, row);
        row += 10;
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [node.id, w, h]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
