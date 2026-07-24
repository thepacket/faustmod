import { useState } from "react";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const COLORS = ["#4dabf7", "#69db7c", "#ffa94d", "#f783ac", "#9775fa", "#ced4da"];

/**
 * A labelled, coloured frame for grouping a section of a patch visually. It has no
 * ports and makes no sound: it sits behind the nodes it surrounds (pointer events pass
 * through its interior) so you can still work inside it.
 */
export function PanelFrame({ node }: { node: WidgetNode }) {
  const w = node.width ?? 260;
  const h = node.height ?? 160;
  const [label, setLabel] = useState((node.widgetState.label as string) ?? "Group");
  const [color, setColor] = useState(
    (node.widgetState.color as string) ?? COLORS[0],
  );

  const cycleColor = () => {
    const next = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length];
    setColor(next);
    node.widgetState.color = next;
    WidgetBridge.onChange();
  };

  return (
    <div className="panel-frame" style={{ width: w, height: h, borderColor: color }}>
      <div className="panel-frame-bar" style={{ background: color }}>
        <input
          className="panel-frame-label"
          value={label}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            setLabel(e.target.value);
            node.widgetState.label = e.target.value;
            WidgetBridge.onChange();
          }}
        />
        <button
          className="panel-frame-color"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={cycleColor}
          title="Change the frame colour"
        >
          ●
        </button>
      </div>
    </div>
  );
}
