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
    id: "xy-scope",
    title: "XY Scope",
    category: "Instruments",
    kind: "widget",
    widget: "xyscope",
    // Square 1:1 (vectorscope); resize keeps the aspect via widgetConfig.square.
    widgetConfig: { square: true },
    tooltip: "XY / vectorscope (Lissajous). Plots x (horizontal) against y (vertical); both −1…1.",
    inputs: [{ label: "x" }, { label: "y" }],
    outputs: [],
    resizable: true,
    defaultSize: { w: 160, h: 160 },
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
  {
    id: "spectrum",
    title: "Spectrum Analyzer",
    category: "Instruments",
    kind: "widget",
    widget: "spectrum",
    tooltip: "Real-time frequency spectrum (20 Hz – 20 kHz, log scale) with peak-hold.",
    inputs: [{ label: "in" }],
    outputs: [],
    resizable: true,
    defaultSize: { w: 300, h: 160 },
  },

  // ---- Meters -------------------------------------------------------------
  {
    id: "tuner",
    title: "Chromatic Tuner",
    category: "Instruments",
    kind: "widget",
    widget: "tuner",
    tooltip:
      "Chromatic tuner. Feed an oscillator / voltage source to read its note, " +
      "frequency and cents deviation (for calibration).",
    inputs: [{ label: "in" }],
    outputs: [],
  },

  {
    id: "meter-analog",
    title: "VU Meter",
    category: "Meters",
    kind: "widget",
    widget: "meter-analog",
    widgetConfig: { scale: "vu" },
    tooltip: "Analog needle VU meter (−20…+3 dB).",
    inputs: [{ label: "in" }],
    outputs: [],
    resizable: true,
    defaultSize: { w: 150, h: 92 },
  },
  {
    id: "meter-linear",
    title: "Level Meter",
    category: "Meters",
    kind: "widget",
    widget: "meter-analog",
    widgetConfig: { scale: "linear" },
    tooltip: "Analog needle meter with a linear 0–1 scale.",
    inputs: [{ label: "in" }],
    outputs: [],
    resizable: true,
    defaultSize: { w: 150, h: 92 },
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
  {
    id: "freqmeter",
    title: "Frequency Meter",
    category: "Meters",
    kind: "widget",
    widget: "freqmeter",
    tooltip: "Numeric readout of the input signal's fundamental frequency (Hz / kHz).",
    inputs: [{ label: "in" }],
    outputs: [],
  },
  {
    id: "record",
    title: "Record",
    category: "I/O",
    kind: "widget",
    widget: "record",
    tooltip:
      "Records the master output while its 'on' input is non-zero; 0 stops (and saves). " +
      "Recording also stops when playback stops.",
    inputs: [{ label: "on" }],
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
    outputs: [{ label: "" }],
  },
  // Convenience banks: dropping one lays down an N×N grid of independent knobs. These
  // never become a single node — the drop handler expands them into that many knobs.
  ...([2, 3, 4, 5, 6] as const).map(
    (n): ComponentDef => ({
      id: `knobs-${n}`,
      title: `Knobs ${n}×${n}`,
      category: "Controls",
      kind: "widget",
      widget: "knob",
      widgetConfig: { default: 0.5, min: 0, max: 1 },
      tooltip: `A ${n}×${n} grid of ${n * n} knobs. Drop it, then wire each into a control input.`,
      inputs: [],
      outputs: [{ label: "" }],
    }),
  ),
  {
    id: "button",
    title: "Button",
    category: "Controls",
    kind: "widget",
    widget: "button",
    widgetConfig: { mode: "momentary" },
    tooltip: "Momentary button — outputs 1 while held, 0 when released.",
    inputs: [],
    outputs: [{ label: "" }],
  },
  {
    id: "toggle",
    title: "Toggle",
    category: "Controls",
    kind: "widget",
    widget: "button",
    widgetConfig: { mode: "latch" },
    tooltip: "Latching button — click to toggle between 1 and 0.",
    inputs: [],
    outputs: [{ label: "" }],
  },
  {
    id: "slider-v",
    title: "V Slider",
    category: "Controls",
    kind: "widget",
    widget: "slider",
    widgetConfig: { default: 0.5, min: 0, max: 1, orientation: "v" },
    tooltip: "Vertical slider — drag to set its value. Wire into a control input.",
    inputs: [],
    outputs: [{ label: "" }],
    resizable: false,
    defaultSize: { w: 16, h: 150 },
  },
  {
    id: "slider-h",
    title: "H Slider",
    category: "Controls",
    kind: "widget",
    widget: "slider",
    widgetConfig: { default: 0.5, min: 0, max: 1, orientation: "h" },
    tooltip: "Horizontal slider — drag to set its value. Wire into a control input.",
    inputs: [],
    outputs: [{ label: "" }],
    resizable: false,
    defaultSize: { w: 180, h: 16 },
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
    tooltip:
      "8-step note sequencer. Clock in advances the step. Drag steps for pitch, " +
      "click to mute, shift-drag for velocity. Outputs frequency, gate and velocity.",
    inputs: [{ label: "clock" }],
    outputs: [{ label: "freq" }, { label: "gate" }, { label: "vel" }],
  },
  {
    id: "seq16",
    title: "Sequencer x16",
    category: "Sequencers",
    kind: "widget",
    widget: "sequencer",
    widgetConfig: { steps: 16 },
    tooltip:
      "16-step note sequencer. Clock in advances the step. Drag steps for pitch, " +
      "click to mute, shift-drag for velocity. Outputs frequency, gate and velocity.",
    inputs: [{ label: "clock" }],
    outputs: [{ label: "freq" }, { label: "gate" }, { label: "vel" }],
  },

  // ---- Macro controllers --------------------------------------------------
  {
    id: "xypad",
    title: "XY Pad",
    category: "Controls",
    kind: "widget",
    widget: "xypad",
    widgetConfig: { square: true },
    tooltip: "2D macro control — drag the pad. Outputs X and Y (0..1). Wire into control inputs.",
    inputs: [],
    outputs: [{ label: "x" }, { label: "y" }],
    resizable: true,
    defaultSize: { w: 120, h: 120 },
  },

  // ---- Sampling -----------------------------------------------------------
  {
    id: "sampler",
    title: "Sample Player",
    category: "Sampling",
    kind: "widget",
    widget: "sampler",
    tooltip:
      "Loads an audio file (click to choose). A rising edge on trig plays it; " +
      "rate scales playback speed/pitch. Outputs stereo L/R.",
    inputs: [{ label: "trig" }, { label: "rate", default: 1, min: 0.1, max: 4 }],
    outputs: [{ label: "L" }, { label: "R" }],
    resizable: true,
    defaultSize: { w: 200, h: 90 },
  },
  {
    id: "granular",
    title: "Granular",
    category: "Sampling",
    kind: "widget",
    widget: "granular",
    tooltip:
      "Granular cloud from a loaded file. Continuously spawns overlapping windowed " +
      "grains. Wire control inputs to scan/modulate. Outputs stereo L/R.",
    inputs: [
      { label: "pos", default: 0, min: 0, max: 1, tooltip: "Playhead position into the sample." },
      { label: "size", default: 80, min: 5, max: 500, unit: "ms", tooltip: "Grain length." },
      { label: "density", default: 20, min: 1, max: 200, unit: "Hz", tooltip: "Grains per second." },
      { label: "pitch", default: 1, min: 0.25, max: 4, tooltip: "Grain playback rate / pitch." },
      { label: "spray", default: 0.1, min: 0, max: 1, tooltip: "Random position jitter." },
    ],
    outputs: [{ label: "L" }, { label: "R" }],
    resizable: true,
    defaultSize: { w: 210, h: 120 },
  },

  // ---- Drawable editors ---------------------------------------------------
  // The drawn shape IS the parameter: these persist their points/cells in the patch
  // and push them to the running unit (see src/audio/tableUnits.ts).
  {
    id: "envelope",
    title: "Envelope",
    category: "Envelopes",
    kind: "widget",
    widget: "envelope",
    tooltip:
      "Draw a multi-stage envelope. A rising edge on gate sweeps the shape once over " +
      "time seconds. Drag points, double-click to add, right-click to remove.",
    inputs: [
      { label: "gate", tooltip: "Rising edge starts the envelope." },
      { label: "time", default: 0.5, min: 0.01, max: 10, unit: "s", tooltip: "Sweep duration." },
    ],
    outputs: [{ label: "env", tooltip: "The drawn contour, 0..1." }],
    resizable: true,
    defaultSize: { w: 220, h: 110 },
  },
  {
    id: "wavedraw",
    title: "Wavetable Draw",
    category: "Oscillators",
    kind: "widget",
    widget: "wavedraw",
    tooltip: "Draw one cycle; the oscillator scans it at the freq input.",
    inputs: [
      { label: "freq", default: 220, min: 20, max: 20000, unit: "Hz" },
      { label: "gain", default: 0.5, min: 0, max: 1 },
    ],
    outputs: [{ label: "out" }],
    resizable: true,
    defaultSize: { w: 200, h: 110 },
  },
  {
    id: "curve",
    title: "Transfer Curve",
    category: "Distortion",
    kind: "widget",
    widget: "curve",
    tooltip: "Waveshaper you draw: x is the input sample (-1..1), y the output.",
    inputs: [{ label: "in" }],
    outputs: [{ label: "out" }],
    resizable: true,
    defaultSize: { w: 150, h: 150 },
  },
  ...([8, 16] as const).map(
    (bars): ComponentDef => ({
      id: `multislider-${bars}`,
      title: `Multislider x${bars}`,
      category: "Controls",
      kind: "widget",
      widget: "multislider",
      widgetConfig: { bars },
      tooltip: `${bars} bars, each its own control output. Sweep across them to draw a contour.`,
      inputs: [],
      outputs: Array.from({ length: bars }, (_, i) => ({ label: `${i + 1}` })),
      resizable: true,
      defaultSize: { w: Math.max(120, bars * 14), h: 90 },
    }),
  ),
  {
    id: "eq-curve",
    title: "Graphic EQ",
    category: "EQ",
    kind: "widget",
    widget: "eq-curve",
    widgetConfig: { bands: 10 },
    tooltip:
      "10-band graphic EQ (31 Hz - 16 kHz). Drag the curve; double-click flattens it.",
    inputs: [{ label: "in" }],
    outputs: [{ label: "out" }],
    resizable: true,
    defaultSize: { w: 240, h: 110 },
  },

  // ---- Sequencing & timing ------------------------------------------------
  {
    id: "transport",
    title: "Transport",
    category: "Sequencers",
    kind: "widget",
    widget: "transport",
    tooltip:
      "Master clock: run/stop, reset and tap tempo. Outputs a 16th-note clock to drive " +
      "the grid, roll and Euclid widgets.",
    inputs: [
      { label: "run", default: 0, min: 0, max: 1, tooltip: "Above 0.5 forces run." },
      { label: "bpm", default: 120, min: 20, max: 300, tooltip: "Tempo (the panel drives this when unwired)." },
    ],
    outputs: [
      { label: "clock", tooltip: "16th-note trigger." },
      { label: "reset", tooltip: "Fires on step 1 of each bar." },
      { label: "bar", tooltip: "Position through the bar, 0..1." },
    ],
  },
  {
    id: "drumgrid",
    title: "Drum Grid",
    category: "Sequencers",
    kind: "widget",
    widget: "drumgrid",
    widgetConfig: { lanes: 8, steps: 16 },
    tooltip: "8 lanes x 16 steps, one trigger output per lane. Click toggles, drag paints.",
    inputs: [{ label: "clock" }, { label: "reset" }],
    outputs: Array.from({ length: 8 }, (_, i) => ({ label: `${i + 1}` })),
    resizable: true,
    defaultSize: { w: 240, h: 104 },
  },
  {
    id: "pianoroll",
    title: "Piano Roll",
    category: "Sequencers",
    kind: "widget",
    widget: "pianoroll",
    widgetConfig: { steps: 32 },
    tooltip:
      "Clip editor: notes with pitch, start and length over 32 steps. Click places, " +
      "drag right lengthens, click again removes.",
    inputs: [{ label: "clock" }, { label: "reset" }],
    outputs: [{ label: "freq" }, { label: "gate" }, { label: "vel" }],
    resizable: true,
    defaultSize: { w: 320, h: 160 },
  },
  {
    id: "euclid-circle",
    title: "Euclid Circle",
    category: "Sequencers",
    kind: "widget",
    widget: "euclid",
    tooltip:
      "Euclidean rhythm circle. Drag x for pulses, y for steps, shift-drag to rotate.",
    inputs: [{ label: "clock" }, { label: "reset" }],
    outputs: [{ label: "trig" }],
    resizable: true,
    defaultSize: { w: 110, h: 110 },
  },
  {
    id: "turing",
    title: "Turing Machine",
    category: "Sequencers",
    kind: "widget",
    widget: "turing",
    tooltip:
      "Shift-register random sequencer: chance 0 locks the loop, 1 randomises it, " +
      "in between it mutates slowly.",
    inputs: [
      { label: "clock" },
      { label: "chance", default: 0.15, min: 0, max: 1 },
      { label: "range", default: 1, min: 0, max: 10 },
    ],
    outputs: [{ label: "cv" }, { label: "trig" }],
  },
  {
    id: "prob-gate",
    title: "Probability Gate",
    category: "Sequencers",
    kind: "widget",
    widget: "prob-gate",
    tooltip: "Passes each clock trigger with probability `chance`.",
    inputs: [
      { label: "clock" },
      { label: "chance", default: 0.5, min: 0, max: 1 },
    ],
    outputs: [{ label: "trig" }],
  },
];
