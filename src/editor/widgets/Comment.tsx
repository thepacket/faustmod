import { useState } from "react";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

export function Comment({ node }: { node: WidgetNode }) {
  const [text, setText] = useState(String(node.widgetState.text ?? ""));
  const w = node.width ?? 200;
  const h = node.height ?? 90;
  return (
    <textarea
      className="comment"
      style={{ width: w, height: h }}
      value={text}
      placeholder="Note…"
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        setText(e.target.value);
        node.widgetState.text = e.target.value;
        WidgetBridge.onChange();
      }}
    />
  );
}
