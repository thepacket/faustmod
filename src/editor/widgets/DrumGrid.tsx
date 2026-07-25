import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { PatternMonitor } from "../../audio/seqUnits";
import { DrawCanvas, usePersistedState, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const LANE_COLORS = ["#ff6b6b", "#ffa94d", "#ffd43b", "#69db7c", "#4dabf7", "#9775fa", "#f783ac", "#ced4da"];

/**
 * Trigger matrix: `lanes` independent drum tracks over `steps`, one trigger output per
 * lane. Click a cell to toggle it, drag to paint a run of hits. The playhead column
 * tracks the clock input.
 */
export function DrumGrid({ node }: { node: WidgetNode }) {
  const lanes = Number(node.widgetConfig?.lanes ?? 8);
  const steps = Number(node.widgetConfig?.steps ?? 16);
  const w = node.width ?? steps * 15;
  const h = node.height ?? lanes * 13;
  const [getCells, setCells] = usePersistedState<boolean[][]>(node, "cells", () =>
    Array.from({ length: lanes }, () => Array.from({ length: steps }, () => false)),
  );
  const [rev, bump] = useState(0);
  const painting = useRef<boolean | null>(null);
  const playhead = useRef(-1);

  const cells = getCells();
  const commit = (next: boolean[][]) => {
    setCells(next);
    bump((n) => n + 1);
  };

  // Push the pattern to the unit and poll the playhead for the column highlight.
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  useEffect(() => {
    let sent: unknown = null;
    const tick = () => {
      const m = Monitors.get(node.id) as PatternMonitor | undefined;
      if (!m?.setPattern) {
        sent = null;
        return;
      }
      if (m !== sent || cellsRef.current !== sent) {
        m.setPattern({ cells: cellsRef.current.map((r) => r.slice()), steps });
        sent = cellsRef.current;
      }
      const p = m.position();
      if (p !== playhead.current) {
        playhead.current = p;
        bump((n) => n + 1);
      }
    };
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [node.id, steps, rev]);

  const at = (p: Pt) => ({
    lane: Math.min(lanes - 1, Math.max(0, Math.floor((1 - p.y) * lanes))),
    step: Math.min(steps - 1, Math.max(0, Math.floor(p.x * steps))),
  });

  const onDown = (p: Pt) => {
    const { lane, step } = at(p);
    const next = getCells().map((r) => r.slice());
    painting.current = !next[lane][step];
    next[lane][step] = painting.current;
    commit(next);
  };

  const onDrag = (p: Pt) => {
    if (painting.current == null) return;
    const { lane, step } = at(p);
    const live = getCells(); // live state, so painting a run keeps earlier cells
    if (live[lane][step] === painting.current) return;
    const next = live.map((r) => r.slice());
    next[lane][step] = painting.current;
    commit(next);
  };

  return (
    <DrawCanvas
      className="draw-canvas grid-canvas"
      width={w}
      height={h}
      revision={rev}
      title={`${lanes} lanes x ${steps} steps — click toggles, drag paints`}
      onDown={onDown}
      onDrag={onDrag}
      onUp={() => (painting.current = null)}
      draw={(ctx, cw, ch) => {
        const bw = cw / steps;
        const bh = ch / lanes;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(0, 0, cw, ch);
        if (playhead.current >= 0) {
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(playhead.current * bw, 0, bw, ch);
        }
        for (let l = 0; l < lanes; l++) {
          for (let s = 0; s < steps; s++) {
            const on = cells[l]?.[s];
            // Beat shading (every 4th step) keeps the bar readable when empty.
            ctx.fillStyle = on
              ? LANE_COLORS[l % LANE_COLORS.length]
              : s % 4 === 0
                ? "rgba(255,255,255,0.09)"
                : "rgba(255,255,255,0.04)";
            ctx.fillRect(s * bw + 1, l * bh + 1, bw - 2, bh - 2);
          }
        }
      }}
    />
  );
}
