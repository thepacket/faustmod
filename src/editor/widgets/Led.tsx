import { useEffect, useRef } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

const GLOW: Record<string, string> = {
  red: "#ff4d4d",
  green: "#4dff5a",
  blue: "#5b9bff",
  yellow: "#ffe23d",
};

export function Led({ node }: { node: WidgetNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const color = (node.widgetConfig?.color as string) || "red";

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const level = m ? Math.min(1, m.level() * 3.5) : 0;
      const el = ref.current;
      if (el) {
        el.style.filter = `brightness(${(0.25 + level * 1.0).toFixed(3)}) saturate(${(0.7 + level * 0.6).toFixed(2)})`;
        el.style.boxShadow =
          level > 0.02
            ? `0 0 ${(5 + level * 22).toFixed(0)}px ${(2 + level * 4).toFixed(0)}px ${GLOW[color]}, inset 0 1px 2px rgba(255,255,255,0.4)`
            : "inset 0 1px 2px rgba(255,255,255,0.15), 0 1px 2px rgba(0,0,0,0.6)";
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id, color]);

  return (
    <div className="led-wrap">
      <div className={`led led-${color}`} ref={ref} />
    </div>
  );
}
