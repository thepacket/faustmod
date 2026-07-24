import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { EqCurveMonitor } from "../../audio/tableUnits";
import { DrawCanvas, type Pt, usePersistedState } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const RANGE_DB = 18; // full vertical scale, ±dB

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
  const freqs = useRef<number[]>([]);

  const commit = (next: number[]) => {
    setGains(next);
    bump((n) => n + 1);
  };

  const gainsRef = useRef(gains);
  gainsRef.current = gains;
  useEffect(() => {
    const send = () => {
      const m = Monitors.get(node.id) as EqCurveMonitor | undefined;
      if (!m?.setGains) return;
      freqs.current = m.bandFrequencies();
      m.setGains(gainsRef.current);
    };
    send();
    const timer = window.setInterval(send, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const paint = (p: Pt) => {
    const i = Math.min(bands - 1, Math.max(0, Math.round(p.x * (bands - 1))));
    const next = gains.slice();
    next[i] = (p.y * 2 - 1) * RANGE_DB;
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
      onDoublePt={() => commit(Array.from({ length: bands }, () => 0))}
      draw={(ctx, cw, ch) => {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.moveTo(0, ch / 2);
        ctx.lineTo(cw, ch / 2);
        ctx.stroke();

        const x = (i: number) => (i / (bands - 1)) * cw;
        const y = (db: number) => ch / 2 - (db / RANGE_DB) * (ch / 2);

        ctx.beginPath();
        gains.forEach((g, i) => (i === 0 ? ctx.moveTo(x(i), y(g)) : ctx.lineTo(x(i), y(g))));
        ctx.strokeStyle = "#c58cff";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.lineTo(cw, ch / 2);
        ctx.lineTo(0, ch / 2);
        ctx.closePath();
        ctx.fillStyle = "rgba(197,140,255,0.13)";
        ctx.fill();

        ctx.fillStyle = "#e3d0ff";
        gains.forEach((g, i) => {
          ctx.beginPath();
          ctx.arc(x(i), y(g), 2.6, 0, Math.PI * 2);
          ctx.fill();
        });
      }}
    />
  );
}
