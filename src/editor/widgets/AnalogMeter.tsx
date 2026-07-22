import { useEffect, useRef } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

const A0 = -52; // needle angle at position 0 (deg)
const A1 = 52; // needle angle at position 1

/**
 * Analog needle meter. `scale: "vu"` maps the RMS level on a −20…+3 dB VU scale;
 * `scale: "linear"` maps it directly on a linear 0…1 scale. Resizable (the SVG scales
 * proportionally to fit).
 */
export function AnalogMeter({ node }: { node: WidgetNode }) {
  const needle = useRef<SVGGElement>(null);
  const linear = (node.widgetConfig?.scale as string) === "linear";

  useEffect(() => {
    // setInterval (not rAF) + imperative DOM — rAF doesn't reliably tick in rete-hosted
    // node bodies (see the Knob/Sequencer widgets).
    let angle = A0;
    const tick = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const rms = m ? m.level() : 0;
      let pos: number;
      if (linear) {
        pos = Math.max(0, Math.min(1, rms));
      } else {
        const db = 20 * Math.log10(Math.max(rms, 1e-5));
        pos = Math.max(0, Math.min(1, (db + 20) / 23)); // −20 dB … +3 dB
      }
      const target = A0 + (A1 - A0) * pos;
      angle += (target - angle) * 0.3; // needle inertia
      needle.current?.setAttribute("transform", `rotate(${angle.toFixed(2)} 50 52)`);
    };
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  }, [node.id, linear]);

  // Scale ticks across the arc.
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = ((A0 + (A1 - A0) * (i / 10)) * Math.PI) / 180;
    const r1 = 40;
    const r2 = i % 5 === 0 ? 33 : 36;
    return {
      cx: 50 + Math.sin(a) * r1,
      cy: 52 - Math.cos(a) * r1,
      ex: 50 + Math.sin(a) * r2,
      ey: 52 - Math.cos(a) * r2,
      hot: !linear && i >= 8, // red "over" zone only on the VU scale
    };
  });

  const w = node.width ?? 150;
  const h = node.height ?? 92;

  return (
    <div className="vu" style={{ width: w, height: h }}>
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
        {linear && (
          <>
            <text x="16" y="50" className="vu-end" textAnchor="middle">
              0
            </text>
            <text x="84" y="50" className="vu-end" textAnchor="middle">
              1
            </text>
          </>
        )}
        <g ref={needle} transform={`rotate(${A0} 50 52)`}>
          <line x1="50" y1="52" x2="50" y2="15" className="vu-needle" />
        </g>
        <circle cx="50" cy="52" r="3.5" className="vu-hub" />
      </svg>
    </div>
  );
}
