import { useEffect, useRef, useState } from "react";
import { Monitors, type MeterMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

export function DigitalMeter({ node }: { node: WidgetNode }) {
  const [val, setVal] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // setInterval (not rAF) + imperative DOM — rAF doesn't reliably tick in
    // rete-hosted node bodies (see the Knob/Sequencer/AnalogMeter widgets).
    let frame = 0;
    const tick = () => {
      const m = Monitors.get(node.id) as MeterMonitor | undefined;
      const level = m ? m.level() : 0;
      if (barRef.current) barRef.current.style.width = `${Math.min(100, level * 100).toFixed(1)}%`;
      // Throttle the numeric text so it's readable.
      if (frame++ % 3 === 0) setVal(level);
    };
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  }, [node.id]);

  return (
    <div className="dvm">
      <div className="dvm-readout">{val.toFixed(4)}</div>
      <div className="dvm-bar">
        <div className="dvm-bar-fill" ref={barRef} />
      </div>
    </div>
  );
}
