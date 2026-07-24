import { useRef, useState } from "react";
import { DrawCanvas, clamp01, rasterize, usePersistedState, useTableSync, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const HIT = 0.045; // grab radius in normalized space

const DEFAULT_POINTS: Pt[] = [
  { x: 0, y: 0 },
  { x: 0.08, y: 1 },
  { x: 0.35, y: 0.6 },
  { x: 0.75, y: 0.55 },
  { x: 1, y: 0 },
];

/**
 * Multi-stage envelope drawn as breakpoints. A gate edge sweeps the shape once over
 * the `time` input, so any contour — AD, ADSR, multi-hump, reverse — is just a drawing.
 * Drag a point to move it, double-click empty space to add one, right-click to remove.
 */
export function EnvelopeEditor({ node }: { node: WidgetNode }) {
  const w = node.width ?? 220;
  const h = node.height ?? 110;
  const [getPoints, setPoints] = usePersistedState<Pt[]>(node, "points", () => DEFAULT_POINTS);
  const [rev, bump] = useState(0);
  const dragging = useRef<number | null>(null);

  const points = getPoints();
  const commit = (next: Pt[]) => {
    setPoints(next);
    bump((n) => n + 1);
  };

  useTableSync(node.id, () => rasterize(getPoints(), 512), [rev]);

  const nearest = (p: Pt) => {
    let best = -1;
    let bestD = HIT;
    points.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const onDown = (p: Pt, e: { button: number }) => {
    const i = nearest(p);
    if (e.button === 2) {
      // Right-click removes an interior point (the endpoints anchor the shape).
      if (i > 0 && i < points.length - 1) commit(points.filter((_, k) => k !== i));
      return;
    }
    if (i >= 0) dragging.current = i;
  };

  const onDrag = (p: Pt) => {
    const i = dragging.current;
    if (i == null) return;
    const next = points.slice();
    // Endpoints keep their x so the envelope always spans the full time window.
    const x = i === 0 ? 0 : i === next.length - 1 ? 1 : clamp01(p.x);
    const moved = { x, y: clamp01(p.y) };
    next[i] = moved;
    next.sort((a, b) => a.x - b.x);
    dragging.current = next.indexOf(moved);
    commit(next);
  };

  return (
    <DrawCanvas
      className="draw-canvas env-canvas"
      width={w}
      height={h}
      revision={rev}
      title="Envelope — drag points · double-click adds · right-click removes"
      onDown={onDown}
      onDrag={onDrag}
      onUp={() => (dragging.current = null)}
      onDoublePt={(p) => commit([...points, p].sort((a, b) => a.x - b.x))}
      draw={(ctx, cw, ch) => {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 4; i++) {
          ctx.moveTo((cw * i) / 4, 0);
          ctx.lineTo((cw * i) / 4, ch);
          ctx.moveTo(0, (ch * i) / 4);
          ctx.lineTo(cw, (ch * i) / 4);
        }
        ctx.stroke();

        const px = (p: Pt) => [p.x * cw, ch - p.y * ch] as const;
        ctx.beginPath();
        points.forEach((p, i) => {
          const [x, y] = px(p);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = "#57d977";
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.lineTo(cw, ch);
        ctx.lineTo(0, ch);
        ctx.closePath();
        ctx.fillStyle = "rgba(87,217,119,0.14)";
        ctx.fill();

        ctx.fillStyle = "#cfeede";
        for (const p of points) {
          const [x, y] = px(p);
          ctx.beginPath();
          ctx.arc(x, y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }}
    />
  );
}
