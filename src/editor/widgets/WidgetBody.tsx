import type { WidgetNode } from "./WidgetBridge";
import { Scope } from "./Scope";
import { Spectrogram } from "./Spectrogram";
import { SpectrumAnalyzer } from "./SpectrumAnalyzer";
import { Tuner } from "./Tuner";
import { FreqMeter } from "./FreqMeter";
import { AnalogMeter } from "./AnalogMeter";
import { DigitalMeter } from "./DigitalMeter";
import { Led } from "./Led";
import { Sequencer } from "./Sequencer";
import { Knob } from "./Knob";
import { Slider } from "./Slider";
import { Keyboard } from "./Keyboard";
import { MidiIn } from "./MidiIn";
import { Comment } from "./Comment";
import { XYPad } from "./XYPad";
import { Sampler } from "./Sampler";
import { RecordWidget } from "./RecordWidget";

/** Renders the custom body for a widget node, dispatched by its `widget` type. */
export function WidgetBody({ node }: { node: WidgetNode }) {
  switch (node.widget) {
    case "scope":
      return <Scope node={node} />;
    case "spectrogram":
      return <Spectrogram node={node} />;
    case "spectrum":
      return <SpectrumAnalyzer node={node} />;
    case "tuner":
      return <Tuner node={node} />;
    case "freqmeter":
      return <FreqMeter node={node} />;
    case "meter-analog":
      return <AnalogMeter node={node} />;
    case "meter-digital":
      return <DigitalMeter node={node} />;
    case "led":
      return <Led node={node} />;
    case "sequencer":
      return <Sequencer node={node} />;
    case "knob":
      return <Knob node={node} />;
    case "slider":
      return <Slider node={node} />;
    case "keyboard":
      return <Keyboard node={node} />;
    case "midi":
      return <MidiIn node={node} />;
    case "comment":
      return <Comment node={node} />;
    case "xypad":
      return <XYPad node={node} />;
    case "sampler":
    case "granular":
      return <Sampler node={node} />;
    case "record":
      return <RecordWidget node={node} />;
    default:
      return null;
  }
}
