import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import { euclideanPattern, type PatternMonitor } from "../../audio/seqUnits";
import { DrawCanvas, usePersistedState, type Pt } from "./DrawCanvas";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

interface Euclid {
  steps: number;
  pulses: number;
  rotate: number;
}

/**
 * Euclidean rhythm as a circle: pulses spread evenly around `steps`, with the playhead
 * sweeping it. Drag horizontally for pulses, vertically for steps, shift-drag to rotate
 * — the shape of the polygon tells you the groove faster than three numbers do.
 */
export function EuclidCircle({ node }: { node: WidgetNode }) {
  const w = node.width ?? 110;
  const h = node.height ?? 110;
  const [getCfg, setCfg] = usePersistedState<Euclid>(node, "euclid", () => ({
    steps: 16,
    pulses: 5,
    rotate: 0,
  }));
  const [rev, bump] = useState(0);
  const start = useRef<{ p: Pt; cfg: Euclid; shift: boolean } | null>(null);
  const playhead = useRef(-1);

  const cfg = getCfg();
  const pattern = euclideanPattern(cfg.steps, cfg.pulses, cfg.rotate);

  const commit = (next: Euclid) => {
    setCfg(next);
    bump((n) => n + 1);
  };

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  useEffect(() => {
    let sent: unknown = null;
    const tick = () => {
      const m = Monitors.get(node.id) as PatternMonitor | undefined;
      if (!m?.setPattern) {
        sent = null;
        return;
      }
      const c = cfgRef.current;
      if (sent !== c) {
        m.setPattern({ euclid: euclideanPattern(c.steps, c.pulses, c.rotate), steps: c.steps });
        sent = c;
      }
      const p = m.position();
      if (p !== playhead.current) {
        playhead.current = p;
        bump((n) => n + 1);
      }
    };
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [node.id, rev]);

  const onDown = (p: Pt, e: { shiftKey: boolean }) => {
    start.current = { p, cfg, shift: e.shiftKey };
  };

  const onDrag = (p: Pt) => {
    const s = start.current;
    if (!s) return;
    if (s.shift) {
      commit({ ...s.cfg, rotate: s.cfg.rotate + Math.round((p.x - s.p.x) * 16) });
      return;
    }
    const steps = Math.max(2, Math.min(32, s.cfg.steps + Math.round((p.y - s.p.y) * 24)));
    const pulses = Math.max(0, Math.min(steps, s.cfg.pulses + Math.round((p.x - s.p.x) * 24)));
    if (steps === cfg.steps && pulses === cfg.pulses) return;
    commit({ ...s.cfg, steps, pulses });
  };

  return (
    <DrawCanvas
      className="draw-canvas euclid-canvas"
      width={w}
      height={h}
      revision={rev}
      title={`Euclid ${cfg.pulses}/${cfg.steps} rot ${cfg.rotate} — drag x pulses · y steps · shift-drag rotate`}
      onDown={onDown}
      onDrag={onDrag}
      onUp={() => {
        start.current = null;
        WidgetBridge.onChange();
      }}
      draw={(ctx, cw, ch) => {
        const cx = cw / 2;
        const cy = ch / 2;
        const r = Math.min(cw, ch) / 2 - 9;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        const pos = (i: number) => {
          const a = (i / pattern.length) * Math.PI * 2 - Math.PI / 2;
          return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
        };
        // Join the hits into a polygon — the classic Euclidean necklace.
        const hits = pattern.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
        if (hits.length > 1) {
          ctx.beginPath();
          hits.forEach((i, k) => {
            const [x, y] = pos(i);
            if (k === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.closePath();
          ctx.strokeStyle = "rgba(255,169,77,0.5)";
          ctx.stroke();
        }
        pattern.forEach((on, i) => {
          const [x, y] = pos(i);
          ctx.beginPath();
          ctx.arc(x, y, on ? 4.2 : 2.2, 0, Math.PI * 2);
          ctx.fillStyle = i === playhead.current ? "#fff" : on ? "#ffa94d" : "rgba(255,255,255,0.22)";
          ctx.fill();
        });
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = "9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${cfg.pulses}/${cfg.steps}`, cx, cy + 3);
      }}
    />
  );
}
