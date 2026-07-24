import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { MultiCVMonitor } from "../../audio/tableUnits";
import { DrawCanvas, clamp01, usePersistedState, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const OUTS = 8;
const CORNERS = ["A", "B", "C", "D"] as const; // A=TL, B=TR, C=BL, D=BR

type Snapshots = number[][];

const randomVector = () => Array.from({ length: OUTS }, () => Math.random());

/**
 * Snapshot morph pad: four corner presets of eight control values, bilinearly blended
 * by where you drag the puck. Store a corner from the current blend, or roll a random
 * one — then sweep the pad to move every destination at once.
 */
export function MorphPad({ node }: { node: WidgetNode }) {
  const w = node.width ?? 130;
  const h = node.height ?? 130;
  const [getSnaps, setSnaps] = usePersistedState<Snapshots>(node, "snapshots", () => [
    Array.from({ length: OUTS }, () => 0.2),
    Array.from({ length: OUTS }, () => 0.5),
    Array.from({ length: OUTS }, () => 0.8),
    randomVector(),
  ]);
  const [getPos, setPos] = usePersistedState<Pt>(node, "pos", () => ({ x: 0.5, y: 0.5 }));
  const [rev, bump] = useState(0);

  const snaps = getSnaps();
  const pos = getPos();

  /** Bilinear blend of the four corners at the puck position. */
  const blend = (p: Pt): number[] => {
    const [a, b, c, d] = snaps;
    const tx = clamp01(p.x);
    const ty = clamp01(p.y);
    return Array.from({ length: OUTS }, (_, i) => {
      const top = a[i] * (1 - tx) + b[i] * tx;
      const bot = c[i] * (1 - tx) + d[i] * tx;
      return bot * (1 - ty) + top * ty;
    });
  };

  const valuesRef = useRef(blend(pos));
  valuesRef.current = blend(pos);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as MultiCVMonitor | undefined;
      m?.setValues?.(valuesRef.current);
    }, 60);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const move = (p: Pt) => {
    setPos({ x: clamp01(p.x), y: clamp01(p.y) });
    bump((n) => n + 1);
  };

  const storeCorner = (i: number) => {
    const next = snaps.map((s, k) => (k === i ? valuesRef.current.slice() : s));
    setSnaps(next);
    bump((n) => n + 1);
  };

  const randomCorner = (i: number) => {
    const next = snaps.map((s, k) => (k === i ? randomVector() : s));
    setSnaps(next);
    bump((n) => n + 1);
  };

  return (
    <div className="morph" onPointerDown={(e) => e.stopPropagation()}>
      <DrawCanvas
        className="draw-canvas morph-canvas"
        width={w}
        height={h}
        revision={rev}
        title="Morph pad — drag to blend the four corner snapshots"
        onDown={move}
        onDrag={move}
        draw={(ctx, cw, ch) => {
          ctx.fillStyle = "rgba(0,0,0,0.22)";
          ctx.fillRect(0, 0, cw, ch);
          ctx.strokeStyle = "rgba(255,255,255,0.07)";
          ctx.beginPath();
          ctx.moveTo(cw / 2, 0);
          ctx.lineTo(cw / 2, ch);
          ctx.moveTo(0, ch / 2);
          ctx.lineTo(cw, ch / 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.font = "9px ui-monospace, monospace";
          ctx.fillText("A", 3, 10);
          ctx.fillText("B", cw - 11, 10);
          ctx.fillText("C", 3, ch - 3);
          ctx.fillText("D", cw - 11, ch - 3);
          // The puck, plus a bar row showing the blended vector.
          const px = pos.x * cw;
          const py = ch - pos.y * ch;
          ctx.beginPath();
          ctx.arc(px, py, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#4dabf7";
          ctx.fill();
          const bw = cw / OUTS;
          valuesRef.current.forEach((v, i) => {
            ctx.fillStyle = "rgba(77,171,247,0.35)";
            ctx.fillRect(i * bw + 1, ch - v * 12 - 1, bw - 2, v * 12);
          });
        }}
      />
      <div className="morph-row">
        {CORNERS.map((label, i) => (
          <span key={label} className="morph-corner">
            <button className="morph-btn" onClick={() => storeCorner(i)} title={`Store the current blend into ${label}`}>
              {label}
            </button>
            <button className="morph-btn dice" onClick={() => randomCorner(i)} title={`Randomize ${label}`}>
              ⚄
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
