import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import { eqBandFrequencies, type EqCurveMonitor } from "../../audio/tableUnits";
import { DrawCanvas, type Pt, usePersistedState } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const RANGE_DB = 18; // full vertical scale, ±dB

/** Compact axis label: 31, 250, 1k, 16k. */
function hzLabel(f: number): string {
  return f >= 1000 ? `${Math.round(f / 100) / 10}k`.replace(".0k", "k") : `${Math.round(f)}`;
}

/**
 * Graphic EQ as one node: drag the curve and the matching peaking filters follow.
 * Replaces patching a row of individual band blocks — the shape is the setting.
 */
export function EqCurve({ node }: { node: WidgetNode }) {
  const bands = Number(node.widgetConfig?.bands ?? 10);
  const w = node.width ?? 240;
  const h = node.height ?? 110;
  const [getGains, setGains] = usePersistedState<number[]>(node, "gains", () =>
    Array.from({ length: bands }, () => 0),
  );
  const [rev, bump] = useState(0);
  const gains = getGains();
  // Same centres the filters use, so the labels are right before audio ever starts.
  const freqs = eqBandFrequencies(bands);
  // Band last touched, echoed as "freq / gain" so a drag reports what it is doing.
  const [touched, setTouched] = useState<number | null>(null);

  const commit = (next: number[]) => {
    setGains(next);
    bump((n) => n + 1);
  };

  const gainsRef = useRef(gains);
  gainsRef.current = gains;
  useEffect(() => {
    const send = () => {
      const m = Monitors.get(node.id) as EqCurveMonitor | undefined;
      m?.setGains?.(gainsRef.current);
    };
    send();
    const timer = window.setInterval(send, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const paint = (p: Pt) => {
    const i = Math.min(bands - 1, Math.max(0, Math.round(p.x * (bands - 1))));
    const next = getGains().slice(); // live state, so a sweep across bands accumulates
    next[i] = (p.y * 2 - 1) * RANGE_DB;
    setTouched(i);
    commit(next);
  };

  return (
    <DrawCanvas
      className="draw-canvas eq-canvas"
      width={w}
      height={h}
      revision={rev}
      title={`${bands}-band graphic EQ — drag the curve (±${RANGE_DB} dB)`}
      onDown={paint}
      onDrag={paint}
      onDoublePt={() => {
        commit(Array.from({ length: bands }, () => 0));
        setTouched(null);
      }}
      draw={(ctx, cw, ch) => {
        const gains = getGains();
        const axis = 11; // strip at the bottom reserved for the frequency labels
        const plot = ch - axis;
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.moveTo(0, plot / 2);
        ctx.lineTo(cw, plot / 2);
        ctx.stroke();

        const x = (i: number) => (i / (bands - 1)) * cw;
        const y = (db: number) => plot / 2 - (db / RANGE_DB) * (plot / 2);

        // Band gridlines, so each dot reads against its own frequency.
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        for (let i = 0; i < bands; i++) {
          ctx.moveTo(x(i), 0);
          ctx.lineTo(x(i), plot);
        }
        ctx.stroke();

        ctx.beginPath();
        gains.forEach((g, i) => (i === 0 ? ctx.moveTo(x(i), y(g)) : ctx.lineTo(x(i), y(g))));
        ctx.strokeStyle = "#c58cff";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.lineTo(cw, plot / 2);
        ctx.lineTo(0, plot / 2);
        ctx.closePath();
        ctx.fillStyle = "rgba(197,140,255,0.13)";
        ctx.fill();

        gains.forEach((g, i) => {
          ctx.beginPath();
          ctx.arc(x(i), y(g), i === touched ? 3.6 : 2.6, 0, Math.PI * 2);
          ctx.fillStyle = i === touched ? "#fff" : "#e3d0ff";
          ctx.fill();
        });

        // Frequency axis. Labels are clamped inside the canvas at both ends, and thinned
        // out when the node is too narrow to fit them all without overlapping.
        ctx.font = "8px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        const every = Math.max(1, Math.ceil((bands * 26) / Math.max(1, cw)));
        freqs.forEach((f, i) => {
          if (i % every !== 0 && i !== bands - 1) return;
          const label = hzLabel(f);
          const half = ctx.measureText(label).width / 2;
          ctx.fillStyle = i === touched ? "#fff" : "rgba(255,255,255,0.45)";
          ctx.fillText(label, Math.min(cw - half - 1, Math.max(half + 1, x(i))), ch - 2);
        });

        // Readout for the band being edited.
        if (touched !== null) {
          const g = gains[touched];
          ctx.textAlign = "left";
          ctx.fillStyle = "rgba(227,208,255,0.9)";
          ctx.fillText(`${hzLabel(freqs[touched])}Hz ${g >= 0 ? "+" : ""}${g.toFixed(1)}dB`, 4, 10);
        }
      }}
    />
  );
}
