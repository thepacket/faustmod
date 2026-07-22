import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors, type Vec2Monitor } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/** 2D macro controller: drag the dot; outputs X (0..1) and Y (0..1, bottom→top). */
export function XYPad({ node }: { node: WidgetNode }) {
  const init = (node.widgetState.xy as [number, number] | undefined) ?? [0.5, 0.5];
  const [xy, setXY] = useState<[number, number]>(init);
  const xyRef = useRef(xy);
  xyRef.current = xy;
  const padRef = useRef<HTMLDivElement>(null);

  // Push to the running unit when it appears / changes.
  useEffect(() => {
    let last: Vec2Monitor | null = null;
    let pushed: [number, number] | null = null;
    const timer = window.setInterval(() => {
      const u = Monitors.get(node.id) as Vec2Monitor | undefined;
      if (u && (u !== last || xyRef.current !== pushed)) {
        u.setXY(xyRef.current[0], xyRef.current[1]);
        last = u;
        pushed = xyRef.current;
      } else if (!u) {
        last = null;
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const apply = (clientX: number, clientY: number) => {
    const r = padRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    const next: [number, number] = [x, y];
    xyRef.current = next;
    node.widgetState.xy = next;
    setXY(next);
  };

  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    apply(e.clientX, e.clientY);
    const move = (ev: globalThis.PointerEvent) => apply(ev.clientX, ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      WidgetBridge.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Square, sized from the node (kept 1:1 by the resize handle).
  const size = node.width ?? 120;

  return (
    <div
      className="xypad"
      ref={padRef}
      onPointerDown={onDown}
      title="Drag to set X / Y"
      style={{ width: size, height: size }}
    >
      <div className="xypad-cross-h" style={{ top: `${(1 - xy[1]) * 100}%` }} />
      <div className="xypad-cross-v" style={{ left: `${xy[0] * 100}%` }} />
      <div
        className="xypad-dot"
        style={{ left: `${xy[0] * 100}%`, top: `${(1 - xy[1]) * 100}%` }}
      />
      <div className="xypad-val">
        {xy[0].toFixed(2)}, {xy[1].toFixed(2)}
      </div>
    </div>
  );
}
