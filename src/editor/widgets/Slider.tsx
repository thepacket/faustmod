import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/** A vertical or horizontal slider outputting a value (backed by a ConstantUnit). */
export function Slider({ node }: { node: WidgetNode }) {
  const cfg = node.widgetConfig ?? {};
  const min = Number(cfg.min ?? 0);
  const max = Number(cfg.max ?? 1);
  const horizontal = (cfg.orientation as string) === "h";
  const unit = (cfg.unit as string) || "";
  const init = Number(node.widgetState.value ?? cfg.default ?? min);
  const [value, setValue] = useState(init);
  const valueRef = useRef(value);
  valueRef.current = value;
  const trackRef = useRef<HTMLDivElement>(null);

  // Push the value to the running unit when it appears / changes (as the Knob does).
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

  const setFromPointer = (clientX: number, clientY: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return;
    const t = horizontal
      ? (clientX - r.left) / r.width
      : 1 - (clientY - r.top) / r.height; // top = max
    const v = min + Math.max(0, Math.min(1, t)) * (max - min);
    valueRef.current = v;
    node.widgetState.value = v;
    setValue(v);
  };

  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      el.setPointerCapture(pointerId); // keep tracking on trackpad/touch
    } catch {
      /* unsupported */
    }
    setFromPointer(e.clientX, e.clientY);
    const move = (ev: globalThis.PointerEvent) => setFromPointer(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
      WidgetBridge.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const frac = (value - min) / (max - min || 1);
  const pct = `${(frac * 100).toFixed(1)}%`;
  const disp = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
  const w = node.width ?? (horizontal ? 180 : 34);
  const h = node.height ?? (horizontal ? 20 : 150);

  return (
    <div
      className={`slider slider-${horizontal ? "h" : "v"}`}
      style={{ width: w, height: h }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="slider-track" ref={trackRef} onPointerDown={onDown} title="Drag to set value">
        <div className="slider-fill" style={horizontal ? { width: pct } : { height: pct }} />
        <div className="slider-thumb" style={horizontal ? { left: pct } : { bottom: pct }} />
      </div>
      <div className="slider-val">
        {disp}
        {unit && <span className="slider-unit">{unit}</span>}
      </div>
    </div>
  );
}
