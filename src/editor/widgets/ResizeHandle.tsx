import type { PointerEvent } from "react";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/** Bottom-right resize grip for resizable widget nodes. `square` locks a 1:1 ratio. */
export function ResizeHandle({
  node,
  minW = 160,
  minH = 90,
  square = false,
}: {
  node: WidgetNode;
  minW?: number;
  minH?: number;
  square?: boolean;
}) {
  const onDown = (e: PointerEvent) => {
    e.stopPropagation(); // don't let rete start dragging the node
    e.preventDefault();
    // Capture the pointer so the drag keeps tracking regardless of what's under the
    // cursor or node re-renders — essential on trackpads/touch, where an uncaptured
    // drag gets hijacked as a scroll gesture and cancelled.
    const el = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* capture unsupported */
    }
    const startX = e.clientX;
    const startY = e.clientY;
    const w0 = node.width ?? 240;
    const h0 = node.height ?? 140;
    const move = (ev: globalThis.PointerEvent) => {
      const k = WidgetBridge.zoom() || 1;
      const dx = (ev.clientX - startX) / k;
      const dy = (ev.clientY - startY) / k;
      if (square) {
        const size = Math.max(minW, Math.round(Math.max(w0, h0) + Math.max(dx, dy)));
        node.width = size;
        node.height = size;
      } else {
        node.width = Math.max(minW, Math.round(w0 + dx));
        node.height = Math.max(minH, Math.round(h0 + dy));
      }
      WidgetBridge.updateNode(node.id);
    };
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
  return <div className="widget-resize" onPointerDown={onDown} title="Drag to resize" />;
}
