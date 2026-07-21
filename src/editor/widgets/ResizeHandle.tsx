import type { PointerEvent } from "react";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/** Bottom-right resize grip for resizable widget nodes. */
export function ResizeHandle({ node, minW = 160, minH = 90 }: { node: WidgetNode; minW?: number; minH?: number }) {
  const onDown = (e: PointerEvent) => {
    e.stopPropagation(); // don't let rete start dragging the node
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const w0 = node.width ?? 240;
    const h0 = node.height ?? 140;
    const move = (ev: globalThis.PointerEvent) => {
      const k = WidgetBridge.zoom() || 1;
      node.width = Math.max(minW, Math.round(w0 + (ev.clientX - startX) / k));
      node.height = Math.max(minH, Math.round(h0 + (ev.clientY - startY) / k));
      WidgetBridge.updateNode(node.id);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      WidgetBridge.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return <div className="widget-resize" onPointerDown={onDown} title="Drag to resize" />;
}
