import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Discrete mode switch — the thing you reach for when a parameter is a *choice*, not a
 * sweep (filter type, waveform, routing). Outputs the selected index, so it feeds a
 * Select block or any control input that takes a whole number.
 *
 * Deliberately buttons rather than a dropdown: every option stays visible and one click
 * away, which is what playing an instrument needs. A list belongs in configuration UI
 * (the MIDI Out port picker), not on a synthesis control.
 */
export function Selector({ node }: { node: WidgetNode }) {
  const count = Number(node.widgetConfig?.options ?? 4);
  const [value, setValue] = useState(Number(node.widgetState.value ?? 0));
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let last: unknown = null;
    let lastVal = NaN;
    const timer = window.setInterval(() => {
      const u = Monitors.get(node.id) as { setValue(v: number): void } | undefined;
      if (u && (u !== last || valueRef.current !== lastVal)) {
        u.setValue(valueRef.current);
        last = u;
        lastVal = valueRef.current;
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const choose = (i: number) => {
    setValue(i);
    valueRef.current = i;
    node.widgetState.value = i;
    WidgetBridge.onChange();
  };

  return (
    <div className="selector" onPointerDown={(e) => e.stopPropagation()}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`sel-btn${value === i ? " on" : ""}`}
          onClick={() => choose(i)}
          title={`Select ${i}`}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
