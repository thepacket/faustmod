import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { PatternMonitor } from "../../audio/seqUnits";
import type { WidgetNode } from "./WidgetBridge";

/**
 * Shift-register random sequencer. Each clock rotates a 16-slot register; the `chance`
 * input decides how often the value wrapping around is replaced with a new random one
 * — 0 locks a loop forever, 1 is pure noise, in between it mutates slowly. The display
 * shows the register so you can see the loop drift.
 */
export function TuringMachine({ node }: { node: WidgetNode }) {
  const [reg, setReg] = useState<number[]>([]);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tick = () => {
      const m = Monitors.get(node.id) as PatternMonitor | undefined;
      const r = m?.register?.() ?? [];
      setReg(r);
    };
    const timer = window.setInterval(tick, 80);
    return () => window.clearInterval(timer);
  }, [node.id]);

  return (
    <div className="turing" ref={barsRef} onPointerDown={(e) => e.stopPropagation()}>
      {(reg.length ? reg : new Array(16).fill(0)).map((v, i) => (
        <span
          key={i}
          className="turing-bar"
          // Percentage height so the register fills whatever the node is; its port
          // stack (clock/chance/range in, cv/trig out) sets the height.
          style={{ height: `${(12 + v * 88).toFixed(0)}%`, opacity: reg.length ? 1 : 0.3 }}
        />
      ))}
    </div>
  );
}
