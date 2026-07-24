import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Discrete mode switch — the thing you reach for when a parameter is a *choice*, not a
 * sweep (filter type, waveform, routing). Outputs the selected index, so it feeds a
 * Select block or any control input that takes a whole number.
 */
export function Selector({ node }: { node: WidgetNode }) {
  const count = Number(node.widgetConfig?.options ?? 4);
  const style = (node.widgetConfig?.style as string) ?? "radio";
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
      {style === "menu" ? (
        <select
          className="sel-menu"
          value={value}
          onChange={(e) => choose(Number(e.target.value))}
          title="Selected index is the output value"
        >
          {Array.from({ length: count }, (_, i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      ) : (
        Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            className={`sel-btn${value === i ? " on" : ""}`}
            onClick={() => choose(i)}
            title={`Select ${i}`}
          >
            {i}
          </button>
        ))
      )}
    </div>
  );
}
