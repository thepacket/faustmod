import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * A push button that outputs 0/1 (backed by a ConstantUnit). Two modes via
 * widgetConfig.mode: "momentary" (1 while held, 0 on release) and "latch" (click
 * toggles and stays). The value is pushed to the running unit like the Knob/Slider.
 */
export function Button({ node }: { node: WidgetNode }) {
  const latch = (node.widgetConfig?.mode as string) === "latch";
  const [on, setOn] = useState<boolean>(() => !!node.widgetState.on);
  const onRef = useRef(on);
  onRef.current = on;

  const push = (v: boolean) => {
    (Monitors.get(node.id) as { setValue(v: number): void } | undefined)?.setValue(v ? 1 : 0);
  };
  const set = (v: boolean) => {
    onRef.current = v;
    node.widgetState.on = v;
    setOn(v);
    push(v);
    WidgetBridge.onChange();
  };

  // Re-assert the value when the unit (re)appears, so state survives play/stop.
  useEffect(() => {
    let last: unknown = null;
    const timer = window.setInterval(() => {
      const u = Monitors.get(node.id);
      if (u && u !== last) {
        push(onRef.current);
        last = u;
      }
    }, 60);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const onDown = (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (latch) {
      set(!onRef.current);
      return;
    }
    // Momentary: capture the pointer so release registers even off the element.
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* unsupported */
    }
    set(true);
  };
  const onUp = () => {
    if (!latch && onRef.current) set(false);
  };

  return (
    <div className="btn-widget" onPointerDown={onDown} onPointerUp={onUp}>
      <div className={`btn-pad ${on ? "on" : ""}`}>{latch ? (on ? "ON" : "OFF") : "PUSH"}</div>
    </div>
  );
}
