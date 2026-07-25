import { useEffect, useRef } from "react";
import { Monitors } from "../../audio/monitors";
import type { PlotMonitor } from "../../audio/plotUnit";
import type { WidgetNode } from "./WidgetBridge";

const COLORS = ["#57d977", "#6ab7ff", "#ffb454", "#f783ac"];

/**
 * Scrolling plot of slow control signals — LFOs, envelopes, sequencer CV. An audio scope
 * shows 40 ms at a time, which is useless for something that moves over seconds; this
 * plots a rolling window of seconds.
 *
 * The samples are pushed by the audio thread (see plotUnit.ts), decimated and stamped
 * with the audio clock. That is what makes the trace survive a background tab: the UI
 * only *draws* here, and whatever accumulated while it was frozen is delivered intact
 * when it wakes. Each sample is the mean of its window, so an audio-rate signal reads as
 * its DC level — this is a CV plotter, not a scope; use Scope x4 for waveforms.
 */
export function CvPlotter({ node }: { node: WidgetNode }) {
  const w = node.width ?? 220;
  const h = node.height ?? 90;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as PlotMonitor | undefined;
      const hist = m?.history?.() ?? [];
      const chans = m?.channels?.() ?? 4;
      const windowSec = m?.windowSec?.() ?? 12;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(0, 0, w, h);

      if (hist.length < 2) {
        ctx.fillStyle = "rgba(255,255,255,0.30)";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.fillText("press Start", 4, 12);
        return;
      }

      // A channel pinned at exactly zero is unconnected or silent; drawing it would put
      // identical flat lines on the baseline and hide the live ones.
      const live: boolean[] = [];
      for (let c = 0; c < chans; c++) live[c] = hist.some((s) => s.v[c] !== 0);

      let lo = 0;
      let hi = 1;
      for (const s of hist) {
        for (let c = 0; c < chans; c++) {
          if (!live[c]) continue;
          if (s.v[c] < lo) lo = s.v[c];
          if (s.v[c] > hi) hi = s.v[c];
        }
      }
      const span = hi - lo || 1;

      const now = hist[hist.length - 1].t;
      const xAt = (t: number) => w - ((now - t) / windowSec) * w;
      const yAt = (v: number) => h - ((v - lo) / span) * h;

      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(0, yAt(0));
      ctx.lineTo(w, yAt(0));
      ctx.stroke();

      for (let c = 0; c < chans; c++) {
        if (!live[c]) continue;
        ctx.strokeStyle = COLORS[c % COLORS.length];
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        hist.forEach((s, i) => {
          const x = xAt(s.t);
          const y = yAt(s.v[c]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.textAlign = "left";
      ctx.fillText(hi.toFixed(2), 3, 10);
      ctx.fillText(lo.toFixed(2), 3, h - 3);

      // Current value per live channel: overlapping traces are indistinguishable alone.
      ctx.textAlign = "right";
      let row = 10;
      const last = hist[hist.length - 1].v;
      for (let c = 0; c < chans; c++) {
        if (!live[c]) continue;
        ctx.fillStyle = COLORS[c % COLORS.length];
        ctx.fillText(
          `${c + 1}: ${Math.abs(last[c]) >= 100 ? last[c].toFixed(0) : last[c].toFixed(3)}`,
          w - 3,
          row,
        );
        row += 10;
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [node.id, w, h]);

  return <canvas className="scope-canvas" ref={canvasRef} style={{ width: w, height: h }} />;
}
