import { useRef, useState } from "react";
import { DrawCanvas, clamp01, usePersistedState, useTableSync, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const CELLS = 48;

/** Identity (y = x): a clean pass-through until the user draws. */
const defaultCurve = () => Array.from({ length: CELLS }, (_, i) => (i / (CELLS - 1)) * 2 - 1);

/**
 * Waveshaper transfer function: the horizontal axis is the input sample (−1..1), the
 * vertical the output. Draw a soft knee, a fold, a step — the shape *is* the
 * distortion. The diagonal guide shows where the curve equals the input.
 */
export function TransferCurve({ node }: { node: WidgetNode }) {
  const w = node.width ?? 150;
  const h = node.height ?? 150;
  const [getCells, setCells] = usePersistedState<number[]>(node, "curve", defaultCurve);
  const [rev, bump] = useState(0);
  const last = useRef<{ idx: number; v: number } | null>(null);

  const commit = (next: number[]) => {
    setCells(next);
    bump((n) => n + 1);
  };

  useTableSync(
    node.id,
    () => {
      const src = getCells();
      const table = new Float32Array(512);
      for (let i = 0; i < table.length; i++) {
        const f = (i / (table.length - 1)) * (src.length - 1);
        const a = src[Math.floor(f)];
        const b = src[Math.min(src.length - 1, Math.floor(f) + 1)];
        table[i] = a + (b - a) * (f - Math.floor(f));
      }
      return table;
    },
    [rev],
  );

  /** Paint from the stroke's previous sample to this one, ramping across the gap. */
  const paint = (p: Pt) => {
    const idx = Math.min(CELLS - 1, Math.max(0, Math.round(p.x * (CELLS - 1))));
    const v = clamp01(p.y) * 2 - 1;
    const next = getCells().slice(); // live state, so a drag accumulates
    const from = last.current ?? { idx, v };
    const span = Math.abs(idx - from.idx);
    if (span === 0) {
      next[idx] = v;
    } else {
      const step = idx > from.idx ? 1 : -1;
      for (let k = 0; k <= span; k++) next[from.idx + k * step] = from.v + ((v - from.v) * k) / span;
    }
    last.current = { idx, v };
    commit(next);
  };

  return (
    <DrawCanvas
      className="draw-canvas curve-canvas"
      width={w}
      height={h}
      revision={rev}
      title="Transfer curve — x is the input sample, y the output"
      onDown={paint}
      onDrag={paint}
      onUp={() => (last.current = null)}
      draw={(ctx, cw, ch) => {
        const cells = getCells();
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        ctx.moveTo(cw / 2, 0);
        ctx.lineTo(cw / 2, ch);
        ctx.moveTo(0, ch / 2);
        ctx.lineTo(cw, ch / 2);
        ctx.stroke();
        // identity reference
        ctx.strokeStyle = "rgba(255,255,255,0.14)";
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, ch);
        ctx.lineTo(cw, 0);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        cells.forEach((v, i) => {
          const x = (i / (CELLS - 1)) * cw;
          const y = ch / 2 - v * (ch / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#ffb454";
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }}
    />
  );
}
