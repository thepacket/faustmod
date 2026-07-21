import type { ComponentDef } from "./library";

/**
 * Instrument / visualization nodes. These realize into custom audio units (see
 * src/audio/monitors.ts) rather than Faust factories, and render a custom React
 * body (see src/editor/widgets/) instead of plain ports.
 */
export const WIDGETS: ComponentDef[] = [
  // ---- Scopes -------------------------------------------------------------
  {
    id: "scope",
    title: "Oscilloscope",
    category: "Instruments",
    kind: "widget",
    widget: "scope",
    tooltip: "Waveform display. Connect a signal; connect a trigger for a stable image.",
    inputs: [{ label: "signal" }, { label: "trigger" }],
    outputs: [],
    resizable: true,
    defaultSize: { w: 280, h: 150 },
  },
  {
    id: "spectrogram",
    title: "Spectrogram",
    category: "Instruments",
    kind: "widget",
    widget: "spectrogram",
    tooltip: "Scrolling frequency-vs-time display.",
    inputs: [{ label: "in" }],
    outputs: [],
    resizable: true,
    defaultSize: { w: 280, h: 150 },
  },

  // ---- Meters -------------------------------------------------------------
  {
    id: "meter-analog",
    title: "VU Meter",
    category: "Meters",
    kind: "widget",
    widget: "meter-analog",
    tooltip: "Analog needle voltmeter (level).",
    inputs: [{ label: "in" }],
    outputs: [],
  },
  {
    id: "meter-digital",
    title: "Digital Meter",
    category: "Meters",
    kind: "widget",
    widget: "meter-digital",
    tooltip: "Digital voltmeter (level readout).",
    inputs: [{ label: "in" }],
    outputs: [],
  },

  // ---- LEDs ---------------------------------------------------------------
  ...(["red", "green", "blue", "yellow"] as const).map(
    (color): ComponentDef => ({
      id: `led-${color}`,
      title: `${color[0].toUpperCase()}${color.slice(1)} LED`,
      category: "Meters",
      kind: "widget",
      widget: "led",
      widgetConfig: { color },
      tooltip: "Lights with the input signal level.",
      inputs: [{ label: "in" }],
      outputs: [],
    }),
  ),

  // ---- Controls -----------------------------------------------------------
  {
    id: "knob",
    title: "Knob",
    category: "Controls",
    kind: "widget",
    widget: "knob",
    widgetConfig: { default: 0.5, min: 0, max: 1 },
    tooltip: "A rotary control — drag to set its value. Wire into a control input.",
    inputs: [],
    outputs: [{ label: "value" }],
  },
  {
    id: "keyboard",
    title: "Keyboard",
    category: "Controls",
    kind: "widget",
    widget: "keyboard",
    tooltip: "Playable keyboard (mouse or A–K keys). Outputs frequency + gate.",
    inputs: [],
    outputs: [{ label: "freq" }, { label: "gate" }],
  },
  {
    id: "midi-in",
    title: "MIDI In",
    category: "Controls",
    kind: "widget",
    widget: "midi",
    tooltip: "MIDI keyboard input. Outputs frequency, gate and velocity (0..1).",
    inputs: [],
    outputs: [{ label: "freq" }, { label: "gate" }, { label: "velocity" }],
  },
  {
    id: "comment",
    title: "Comment",
    category: "Notes",
    kind: "widget",
    widget: "comment",
    tooltip: "A text note to annotate your patch.",
    inputs: [],
    outputs: [],
    resizable: true,
    defaultSize: { w: 200, h: 90 },
  },

  // ---- Sequencers ---------------------------------------------------------
  {
    id: "seq8",
    title: "Sequencer x8",
    category: "Sequencers",
    kind: "widget",
    widget: "sequencer",
    widgetConfig: { steps: 8 },
    tooltip: "8-step note sequencer. Clock in advances the step; outputs its frequency.",
    inputs: [{ label: "clock" }],
    outputs: [{ label: "freq" }],
  },
  {
    id: "seq16",
    title: "Sequencer x16",
    category: "Sequencers",
    kind: "widget",
    widget: "sequencer",
    widgetConfig: { steps: 16 },
    tooltip: "16-step note sequencer. Clock in advances the step; outputs its frequency.",
    inputs: [{ label: "clock" }],
    outputs: [{ label: "freq" }],
  },
];
