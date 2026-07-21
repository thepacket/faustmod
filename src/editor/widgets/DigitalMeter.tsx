import { useEffect, useRef, useState } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

export function DigitalMeter({ node }: { node: WidgetNode }) {
  const [db, setDb] = useState(-Infinity);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let frame = 0;
    const draw = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const level = m ? m.level() : 0;
      if (barRef.current) barRef.current.style.width = `${Math.min(100, level * 140).toFixed(1)}%`;
      // Throttle the numeric text so it's readable.
      if (frame++ % 6 === 0) setDb(level > 1e-5 ? 20 * Math.log10(level) : -Infinity);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [node.id]);

  return (
    <div className="dvm">
      <div className="dvm-readout">
        {db === -Infinity ? "-∞" : db.toFixed(1)}
        <span className="dvm-unit">dB</span>
      </div>
      <div className="dvm-bar">
        <div className="dvm-bar-fill" ref={barRef} />
      </div>
    </div>
  );
}
