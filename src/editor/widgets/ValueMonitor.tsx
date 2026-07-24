import { useEffect, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { TracesMonitor } from "../../audio/tableUnits";
import type { WidgetNode } from "./WidgetBridge";

/**
 * Numeric readout of four signals at once, with min/max held since the last reset —
 * the "print" object. When a patch misbehaves this answers "what is actually on this
 * wire" without wiring up a scope and squinting at it.
 */
export function ValueMonitor({ node }: { node: WidgetNode }) {
  const count = Number(node.widgetConfig?.channels ?? 4);
  const [rows, setRows] = useState<{ v: number; lo: number; hi: number }[]>(
    Array.from({ length: count }, () => ({ v: 0, lo: 0, hi: 0 })),
  );

  useEffect(() => {
    const lo = new Array(count).fill(Infinity);
    const hi = new Array(count).fill(-Infinity);
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as TracesMonitor | undefined;
      if (!m?.value) return;
      setRows(
        Array.from({ length: count }, (_, i) => {
          const v = m.value(i);
          if (v < lo[i]) lo[i] = v;
          if (v > hi[i]) hi[i] = v;
          return { v, lo: lo[i], hi: hi[i] };
        }),
      );
    }, 100);
    return () => window.clearInterval(timer);
  }, [node.id, count]);

  const fmt = (v: number) =>
    !Number.isFinite(v) ? "—" : Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(4);

  return (
    <div className="vmon" onPointerDown={(e) => e.stopPropagation()}>
      {rows.map((r, i) => (
        <div key={i} className="vmon-row">
          <span className="vmon-ch">{i + 1}</span>
          <span className="vmon-v">{fmt(r.v)}</span>
          <span className="vmon-range">
            {fmt(r.lo)} / {fmt(r.hi)}
          </span>
        </div>
      ))}
    </div>
  );
}
