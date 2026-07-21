import type { WidgetNode } from "./WidgetBridge";
import { Scope } from "./Scope";
import { Spectrogram } from "./Spectrogram";
import { AnalogMeter } from "./AnalogMeter";
import { DigitalMeter } from "./DigitalMeter";
import { Led } from "./Led";
import { Sequencer } from "./Sequencer";

/** Renders the custom body for a widget node, dispatched by its `widget` type. */
export function WidgetBody({ node }: { node: WidgetNode }) {
  switch (node.widget) {
    case "scope":
      return <Scope node={node} />;
    case "spectrogram":
      return <Spectrogram node={node} />;
    case "meter-analog":
      return <AnalogMeter node={node} />;
    case "meter-digital":
      return <DigitalMeter node={node} />;
    case "led":
      return <Led node={node} />;
    case "sequencer":
      return <Sequencer node={node} />;
    default:
      return null;
  }
}
