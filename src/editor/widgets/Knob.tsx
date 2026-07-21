import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const A = 135; // knob sweep (deg each side of vertical)

export function Knob({ node }: { node: WidgetNode }) {
  const cfg = node.widgetConfig ?? {};
  const min = Number(cfg.min ?? 0);
  const max = Number(cfg.max ?? 1);
  const unit = (cfg.unit as string) || "";
  const init = Number(node.widgetState.value ?? cfg.default ?? min);
  const [value, setValue] = useState(init);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Push the value to the running unit when it appears / changes.
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

  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    const startV = valueRef.current;
    const range = max - min;
    const move = (ev: globalThis.PointerEvent) => {
      const v = Math.max(min, Math.min(max, startV + ((startY - ev.clientY) / 160) * range));
      valueRef.current = v;
      node.widgetState.value = v;
      setValue(v);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      WidgetBridge.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const t = (value - min) / (max - min || 1);
  const angle = -A + t * 2 * A;
  const disp = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);

  return (
    <div className="knob" onPointerDown={onDown} title="Drag up/down to change">
      <svg viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="22" className="knob-body" />
        <g transform={`rotate(${angle} 30 30)`}>
          <line x1="30" y1="30" x2="30" y2="11" className="knob-ind" />
        </g>
      </svg>
      <div className="knob-val">
        {disp}
        {unit && <span className="knob-unit">{unit}</span>}
      </div>
    </div>
  );
}
