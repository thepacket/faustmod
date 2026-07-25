import { useRef, useState } from "react";
import { DrawCanvas, clamp01, usePersistedState, useTableSync, type Pt } from "./DrawCanvas";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const CELLS = 128; // drawing resolution, resampled up to the 512-point table

const sine = () => Array.from({ length: CELLS }, (_, i) => Math.sin((i / CELLS) * Math.PI * 2));

/** 3-point moving average, wrapping at the cycle boundary so the loop stays seamless. */
function smoothed(cells: number[]): number[] {
  const n = cells.length;
  return cells.map((_, i) => (cells[(i - 1 + n) % n] + cells[i] * 2 + cells[(i + 1) % n]) / 4);
}

/**
 * Draw one cycle of a waveform; the oscillator scans it at the freq input. Strokes are
 * interpolated between pointer samples, so a fast drag paints a line rather than a
 * staircase, and Smooth rounds off the jaggedness that freehand drawing leaves behind
 * (which matters here: every corner in the cycle is audible as harmonics).
 */
export function WaveDraw({ node }: { node: WidgetNode }) {
  const w = node.width ?? 200;
  const h = node.height ?? 110;
  const [getCells, setCells] = usePersistedState<number[]>(node, "wave", sine);
  const [rev, bump] = useState(0);
  // Previous pointer sample of this stroke, so segments can be interpolated.
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
        const f = (i / table.length) * src.length;
        const a = src[Math.floor(f) % src.length];
        const b = src[(Math.floor(f) + 1) % src.length];
        table[i] = a + (b - a) * (f - Math.floor(f));
      }
      return table;
    },
    [rev],
  );

  /**
   * Paint from the stroke's previous sample to this one, ramping the value across the
   * gap. Reads the live state (not the render-time copy) so a drag accumulates.
   */
  const paint = (p: Pt) => {
    const idx = Math.min(CELLS - 1, Math.max(0, Math.floor(p.x * CELLS)));
    const v = clamp01(p.y) * 2 - 1;
    const next = getCells().slice();
    const from = last.current ?? { idx, v };
    const span = Math.abs(idx - from.idx);
    if (span === 0) {
      next[idx] = v;
    } else {
      const step = idx > from.idx ? 1 : -1;
      for (let k = 0; k <= span; k++) {
        const i = from.idx + k * step;
        next[i] = from.v + ((v - from.v) * k) / span;
      }
    }
    last.current = { idx, v };
    commit(next);
  };

  return (
    <div className="wavedraw" onPointerDown={(e) => e.stopPropagation()}>
      <DrawCanvas
        className="draw-canvas wave-canvas"
        width={w}
        height={h}
        revision={rev}
        title="Wavetable — drag to draw one cycle"
        onDown={paint}
        onDrag={paint}
        onUp={() => (last.current = null)}
        draw={(ctx, cw, ch) => {
          const cells = getCells();
          ctx.fillStyle = "rgba(0,0,0,0.18)";
          ctx.fillRect(0, 0, cw, ch);
          ctx.strokeStyle = "rgba(255,255,255,0.10)";
          ctx.beginPath();
          ctx.moveTo(0, ch / 2);
          ctx.lineTo(cw, ch / 2);
          ctx.stroke();

          ctx.beginPath();
          cells.forEach((v, i) => {
            const x = ((i + 0.5) / CELLS) * cw;
            const y = ch / 2 - v * (ch / 2) * 0.92;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.strokeStyle = "#6ab7ff";
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }}
      />
      <div className="wavedraw-row">
        <button
          className="wd-btn"
          onClick={() => {
            commit(smoothed(getCells()));
            WidgetBridge.onChange();
          }}
          title="Round off the corners (click again for more)"
        >
          smooth
        </button>
        <button
          className="wd-btn"
          onClick={() => {
            // Centre on zero and scale to full range — a drawn wave is rarely either.
            const cells = getCells();
            const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
            const centred = cells.map((v) => v - mean);
            const peak = centred.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
            commit(centred.map((v) => v / peak));
            WidgetBridge.onChange();
          }}
          title="Remove DC offset and normalize"
        >
          normalize
        </button>
        <button
          className="wd-btn"
          onClick={() => {
            commit(sine());
            WidgetBridge.onChange();
          }}
          title="Back to a sine"
        >
          reset
        </button>
      </div>
    </div>
  );
}
