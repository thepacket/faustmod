import { useState } from "react";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const COLORS = ["#4dabf7", "#69db7c", "#ffa94d", "#f783ac", "#9775fa", "#ced4da"];

/**
 * A coloured frame for grouping a section of a patch. It has no ports and makes no
 * sound: it sits behind the nodes it surrounds (its interior passes pointer events
 * through, so you can still work inside it), and dragging it carries every node wholly
 * inside it — see the frame handling in createEditor.
 *
 * Naming is the node's own title (click it to rename), so the frame body is just the
 * outline and a colour swatch.
 */
export function PanelFrame({ node }: { node: WidgetNode }) {
  const w = node.width ?? 260;
  const h = node.height ?? 160;
  const [color, setColor] = useState((node.widgetState.color as string) ?? COLORS[0]);

  const cycleColor = () => {
    const next = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length];
    setColor(next);
    node.widgetState.color = next;
    WidgetBridge.onChange();
  };

  return (
    <div
      className="panel-frame"
      style={{
        width: w,
        height: h,
        borderColor: color,
        background: `color-mix(in srgb, ${color} 7%, transparent)`,
      }}
    >
      <button
        className="panel-frame-color"
        style={{ color }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={cycleColor}
        title="Change the frame colour"
      >
        ●
      </button>
    </div>
  );
}
