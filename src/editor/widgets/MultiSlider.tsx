import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { MultiCVMonitor } from "../../audio/tableUnits";
import { DrawCanvas, clamp01, usePersistedState, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

/**
 * A bank of bars, each its own control output — the fastest way to dial in N related
 * values (harmonic amplitudes, step levels, a filter bank). Drag across the bars to
 * sweep a whole contour in one gesture.
 */
export function MultiSlider({ node }: { node: WidgetNode }) {
  const bars = Number(node.widgetConfig?.bars ?? 8);
  const w = node.width ?? Math.max(120, bars * 14);
  const h = node.height ?? 90;
  const [getValues, setValues] = usePersistedState<number[]>(node, "values", () =>
    Array.from({ length: bars }, () => 0.5),
  );
  const [rev, bump] = useState(0);
  const values = getValues();

  const commit = (next: number[]) => {
    setValues(next);
    bump((n) => n + 1);
  };

  // Push to the running unit whenever the bars change (and when the unit appears).
  const valuesRef = useRef(values);
  valuesRef.current = values;
  useEffect(() => {
    let seen: unknown = null;
    const send = () => {
      const m = Monitors.get(node.id) as MultiCVMonitor | undefined;
      if (!m?.setValues) {
        seen = null;
        return;
      }
      if (m !== seen) seen = m;
      m.setValues(valuesRef.current);
    };
    send();
    const timer = window.setInterval(send, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const paint = (p: Pt) => {
    const i = Math.min(bars - 1, Math.max(0, Math.floor(p.x * bars)));
    const next = getValues().slice(); // live state, so sweeping across bars accumulates
    next[i] = clamp01(p.y);
    commit(next);
  };

  return (
    <DrawCanvas
      className="draw-canvas msl-canvas"
      width={w}
      height={h}
      revision={rev}
      title={`${bars} bars — drag to set, sweep across to draw a contour`}
      onDown={paint}
      onDrag={paint}
      draw={(ctx, cw, ch) => {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, cw, ch);
        const bw = cw / bars;
        values.forEach((v, i) => {
          const bh = v * ch;
          ctx.fillStyle = "rgba(106,183,255,0.75)";
          ctx.fillRect(i * bw + 1, ch - bh, bw - 2, bh);
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(i * bw + 1, 0, bw - 2, ch - bh);
        });
      }}
    />
  );
}
