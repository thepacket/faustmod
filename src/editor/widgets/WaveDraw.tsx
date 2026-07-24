import { useRef, useState } from "react";
import { DrawCanvas, clamp01, usePersistedState, useTableSync, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const CELLS = 64; // drawing resolution; smoothed up to the 512-point table

/** A sine, as the starting shape. */
const defaultWave = () =>
  Array.from({ length: CELLS }, (_, i) => Math.sin((i / CELLS) * Math.PI * 2));

/**
 * Draw one cycle of a waveform; the oscillator scans it at the freq input. Values are
 * −1..1, sampled at CELLS points and interpolated into the wavetable, so freehand
 * strokes stay band-limited enough to be usable rather than pure aliasing.
 */
export function WaveDraw({ node }: { node: WidgetNode }) {
  const w = node.width ?? 200;
  const h = node.height ?? 110;
  const [getCells, setCells] = usePersistedState<number[]>(node, "wave", defaultWave);
  const [rev, bump] = useState(0);
  const last = useRef<number | null>(null);

  const cells = getCells();
  const commit = (next: number[]) => {
    setCells(next);
    bump((n) => n + 1);
  };

  useTableSync(
    node.id,
    () => {
      // Resample the cells into the table with linear interpolation.
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

  // Paint cells between the previous and current x so fast drags don't leave gaps.
  const paint = (p: Pt) => {
    const idx = Math.min(CELLS - 1, Math.max(0, Math.floor(p.x * CELLS)));
    const v = clamp01(p.y) * 2 - 1;
    const next = cells.slice();
    const from = last.current ?? idx;
    const lo = Math.min(from, idx);
    const hi = Math.max(from, idx);
    for (let i = lo; i <= hi; i++) next[i] = v;
    last.current = idx;
    commit(next);
  };

  return (
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
  );
}
