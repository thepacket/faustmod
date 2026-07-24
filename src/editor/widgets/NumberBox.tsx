import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Typed numeric entry with a range and a unit. A knob is fine for feel, but when you
 * know the number — 440 Hz, 3 dB, 0.125 s — you want to type it, and see it.
 * Drag adjusts, click types, shift-drag is fine (10x), the value is clamped.
 */
export function NumberBox({ node }: { node: WidgetNode }) {
  const cfg = node.widgetConfig ?? {};
  const min = Number(node.widgetState.min ?? cfg.min ?? 0);
  const max = Number(node.widgetState.max ?? cfg.max ?? 1000);
  const unit = (node.widgetState.unit as string) ?? (cfg.unit as string) ?? "";
  const [value, setValue] = useState(Number(node.widgetState.value ?? cfg.default ?? 0));
  const [editing, setEditing] = useState(false);
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

  const commit = (v: number) => {
    const clamped = Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
    setValue(clamped);
    valueRef.current = clamped;
    node.widgetState.value = clamped;
    WidgetBridge.onChange();
  };

  const onDown = (e: React.PointerEvent) => {
    if (editing) return;
    e.stopPropagation();
    const startY = e.clientY;
    const start = valueRef.current;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      if (Math.abs(dy) > 2) moved = true;
      const step = (max - min) / (ev.shiftKey ? 2000 : 200);
      commit(start + dy * step);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!moved) setEditing(true); // a click (no drag) switches to typing
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Show enough precision to be useful without turning into noise.
  const text = Math.abs(value) >= 100 ? value.toFixed(1) : value.toFixed(3);

  return (
    <div className="numbox" onPointerDown={onDown} title={`${min}…${max}${unit ? " " + unit : ""}`}>
      {editing ? (
        <input
          className="numbox-input"
          autoFocus
          defaultValue={String(value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={(e) => {
            commit(parseFloat(e.target.value));
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <>
          <span className="numbox-val">{text}</span>
          {unit && <span className="numbox-unit">{unit}</span>}
        </>
      )}
    </div>
  );
}
