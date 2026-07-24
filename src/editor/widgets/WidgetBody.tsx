import type { WidgetNode } from "./WidgetBridge";
import { Scope } from "./Scope";
import { XYScope } from "./XYScope";
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
import { Button } from "./Button";
import { EnvelopeEditor } from "./EnvelopeEditor";
import { WaveDraw } from "./WaveDraw";
import { TransferCurve } from "./TransferCurve";
import { MultiSlider } from "./MultiSlider";
import { EqCurve } from "./EqCurve";
import { DrumGrid } from "./DrumGrid";
import { Transport } from "./Transport";
import { PianoRoll } from "./PianoRoll";
import { EuclidCircle } from "./EuclidCircle";
import { TuringMachine } from "./TuringMachine";
import { Selector } from "./Selector";
import { NumberBox } from "./NumberBox";
import { MorphPad } from "./MorphPad";
import { Pads } from "./Pads";
import { Randomize } from "./Randomize";
import { PanelFrame } from "./PanelFrame";
import { MidiOut } from "./MidiOut";
import { MidiMonitor } from "./MidiMonitor";
import { CorrelationMeter } from "./CorrelationMeter";
import { LoudnessMeter } from "./LoudnessMeter";
import { MultiScope } from "./MultiScope";
import { CvPlotter } from "./CvPlotter";
import { ValueMonitor } from "./ValueMonitor";
import { Looper } from "./Looper";
import { IrLoader } from "./IrLoader";

/** Renders the custom body for a widget node, dispatched by its `widget` type. */
export function WidgetBody({ node }: { node: WidgetNode }) {
  switch (node.widget) {
    case "scope":
      return <Scope node={node} />;
    case "xyscope":
      return <XYScope node={node} />;
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
    case "button":
      return <Button node={node} />;
    case "envelope":
      return <EnvelopeEditor node={node} />;
    case "wavedraw":
      return <WaveDraw node={node} />;
    case "curve":
      return <TransferCurve node={node} />;
    case "multislider":
      return <MultiSlider node={node} />;
    case "eq-curve":
      return <EqCurve node={node} />;
    case "drumgrid":
      return <DrumGrid node={node} />;
    case "transport":
      return <Transport node={node} />;
    case "pianoroll":
      return <PianoRoll node={node} />;
    case "euclid":
      return <EuclidCircle node={node} />;
    case "turing":
      return <TuringMachine node={node} />;
    case "selector":
      return <Selector node={node} />;
    case "numbox":
      return <NumberBox node={node} />;
    case "morphpad":
      return <MorphPad node={node} />;
    case "pads":
      return <Pads node={node} />;
    case "randomize":
      return <Randomize node={node} />;
    case "panel-frame":
      return <PanelFrame node={node} />;
    case "midi-out":
      return <MidiOut node={node} />;
    case "midi-monitor":
      return <MidiMonitor node={node} />;
    case "correlation":
      return <CorrelationMeter node={node} />;
    case "loudness":
      return <LoudnessMeter node={node} />;
    case "multiscope":
      return <MultiScope node={node} />;
    case "cv-plot":
      return <CvPlotter node={node} />;
    case "value-monitor":
      return <ValueMonitor node={node} />;
    case "looper":
      return <Looper node={node} />;
    case "ir-loader":
      return <IrLoader node={node} />;
    default:
      return null;
  }
}
