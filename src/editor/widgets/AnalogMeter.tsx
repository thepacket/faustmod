import { useEffect, useRef } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

const A0 = -52; // needle angle at level 0 (deg)
const A1 = 52; // needle angle at level 1

export function AnalogMeter({ node }: { node: WidgetNode }) {
  const needle = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    let angle = A0;
    const draw = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const level = m ? Math.min(1, m.level() * 1.8) : 0;
      const target = A0 + (A1 - A0) * level;
      angle += (target - angle) * 0.25; // needle inertia
      needle.current?.setAttribute("transform", `rotate(${angle.toFixed(2)} 50 52)`);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id]);

  // Scale ticks across the arc.
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((A0 + (A1 - A0) * (i / 10)) * Math.PI) / 180;
    const r1 = 40;
    const r2 = i % 5 === 0 ? 33 : 36;
    const cx = 50 + Math.sin(a) * r1;
    const cy = 52 - Math.cos(a) * r1;
    const ex = 50 + Math.sin(a) * r2;
    const ey = 52 - Math.cos(a) * r2;
    return { cx, cy, ex, ey, hot: i >= 8 };
  });

  return (
    <div className="vu">
      <svg viewBox="0 0 100 56" preserveAspectRatio="xMidYMid meet">
        <rect x="2" y="2" width="96" height="52" rx="4" className="vu-face" />
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.cx}
            y1={t.cy}
            x2={t.ex}
            y2={t.ey}
            className={t.hot ? "vu-tick hot" : "vu-tick"}
          />
        ))}
        <text x="50" y="20" className="vu-label" textAnchor="middle">
          VU
        </text>
        <g ref={needle} transform={`rotate(${A0} 50 52)`}>
          <line x1="50" y1="52" x2="50" y2="15" className="vu-needle" />
        </g>
        <circle cx="50" cy="52" r="3.5" className="vu-hub" />
      </svg>
    </div>
  );
}
