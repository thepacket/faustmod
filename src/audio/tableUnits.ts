/**
 * Units backing the *drawable* widgets — the ones whose on-screen shape is the data.
 * A single worklet reads a Float32Array table the React body pushes in via Monitors;
 * `mode` decides what the table means:
 *
 *   shaper    — transfer function: out = table[(in + 1) / 2]   (waveshaper, EQ curve)
 *   wavetable — one cycle scanned at the freq input             (wavetable drawer)
 *   envelope  — one-shot sweep across the table on a gate edge  (envelope editor)
 *
 * Keeping them in one processor means one worklet module for five widgets, and the
 * table transport (postMessage of a Float32Array) is written once.
 */
import type { AudioUnit, InputSpec } from "./types";

export type TableMode = "shaper" | "wavetable" | "envelope";

/** What a drawable widget's React body calls to push its shape to the running graph. */
export interface TableMonitor {
  setTable(table: Float32Array): void;
}

const TABLE_PROCESSOR = "faustmod-table";
const tableRegistered = new WeakSet<BaseAudioContext>();

// Channels of the single worklet input, by mode:
//   shaper    0 = signal
//   wavetable 0 = freq (Hz), 1 = gain
//   envelope  0 = gate,      1 = time (s)
const TABLE_CODE = `
class TableProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.mode = (options.processorOptions && options.processorOptions.mode) || "shaper";
    this.table = new Float32Array([0, 0]);
    this.phase = 0;      // wavetable: 0..1 cycle position
    this.envPos = -1;    // envelope: 0..1 read position, <0 = idle
    this.prevGate = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.table) this.table = e.data.table;
    };
  }
  // Linear interpolation at a 0..1 position into the table.
  read(p) {
    const t = this.table, n = t.length;
    if (n === 0) return 0;
    if (n === 1) return t[0];
    const x = p <= 0 ? 0 : p >= 1 ? 1 : p;
    const f = x * (n - 1);
    const i = f | 0;
    const frac = f - i;
    return i >= n - 1 ? t[n - 1] : t[i] * (1 - frac) + t[i + 1] * frac;
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [];
    const a = inp[0];
    const b = inp[1];
    const out = outputs[0][0];
    if (this.mode === "shaper") {
      for (let i = 0; i < out.length; i++) {
        const x = a ? a[i] : 0;
        out[i] = this.read(x * 0.5 + 0.5);
      }
    } else if (this.mode === "wavetable") {
      for (let i = 0; i < out.length; i++) {
        const f = a ? a[i] : 0;
        const g = b ? b[i] : 1;
        out[i] = this.read(this.phase) * g;
        this.phase += f / sampleRate;
        if (this.phase >= 1) this.phase -= (this.phase | 0);
        else if (this.phase < 0) this.phase = 0;
      }
    } else {
      for (let i = 0; i < out.length; i++) {
        const gate = a ? a[i] : 0;
        if (this.prevGate <= 0.5 && gate > 0.5) this.envPos = 0;
        this.prevGate = gate;
        if (this.envPos < 0) { out[i] = 0; continue; }
        out[i] = this.read(this.envPos);
        const secs = b ? b[i] : 1;
        this.envPos += 1 / (Math.max(0.001, secs) * sampleRate);
        if (this.envPos > 1) this.envPos = -1; // one-shot: idle until the next edge
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(TABLE_PROCESSOR)}, TableProcessor);
`;

async function ensureTableModule(ctx: BaseAudioContext): Promise<void> {
  if (tableRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([TABLE_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  tableRegistered.add(ctx);
}

export class TableUnit implements AudioUnit, TableMonitor {
  readonly numInputs: number;
  readonly numOutputs = 1;
  private merger: ChannelMergerNode;
  /** Per-input fallback source for control ports, detached while a signal is wired in. */
  private defs: (ConstantSourceNode | null)[] = [];

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
    inputs: InputSpec[],
  ) {
    this.numInputs = Math.max(1, inputs.length);
    this.merger = ctx.createChannelMerger(this.numInputs);
    this.merger.connect(this.node);
    inputs.forEach((spec, i) => {
      if (spec.default === undefined) {
        this.defs[i] = null;
        return;
      }
      const src = ctx.createConstantSource();
      src.offset.value = spec.default;
      src.connect(this.merger, 0, i);
      src.start();
      this.defs[i] = src;
    });
  }

  static async create(
    ctx: BaseAudioContext,
    mode: TableMode,
    inputs: InputSpec[],
  ): Promise<TableUnit> {
    await ensureTableModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, TABLE_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: Math.max(1, inputs.length),
      channelCountMode: "explicit",
      processorOptions: { mode },
    });
    return new TableUnit(ctx, node, inputs);
  }

  input(i: number) {
    return i >= 0 && i < this.numInputs ? { node: this.merger as AudioNode, channel: i } : null;
  }
  output(i: number) {
    return i === 0 ? { node: this.node as AudioNode, channel: 0 } : null;
  }
  setTable(table: Float32Array) {
    this.node.port.postMessage({ table }, [table.buffer]);
  }
  setValue() {}
  onInputConnected(i: number, connected: boolean) {
    const src = this.defs[i];
    if (!src) return;
    try {
      if (connected) src.disconnect();
      else src.connect(this.merger, 0, i);
    } catch {
      /* already in the desired state */
    }
  }
  dispose() {
    try {
      for (const s of this.defs) {
        if (!s) continue;
        s.stop();
        s.disconnect();
      }
      this.merger.disconnect();
      this.node.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Drawn EQ curve: a chain of peaking biquads --------------------------
export interface EqCurveMonitor {
  setGains(gainsDb: number[]): void;
  bandFrequencies(): number[];
}

/**
 * The graphic-EQ widget's audio side: `bands` peaking filters on log-spaced centres,
 * whose gains come from the drawn curve. Native BiquadFilterNodes, so no worklet and
 * the coefficients update smoothly.
 */
export class EqCurveUnit implements AudioUnit, EqCurveMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 1;
  private filters: BiquadFilterNode[];
  private freqs: number[];

  constructor(ctx: BaseAudioContext, bands = 10, low = 31.25, high = 16000) {
    const ratio = Math.pow(high / low, 1 / Math.max(1, bands - 1));
    this.freqs = Array.from({ length: bands }, (_, i) => low * Math.pow(ratio, i));
    // Q that makes adjacent bands overlap smoothly across one step of the ratio.
    const q = Math.sqrt(ratio) / (ratio - 1);
    this.filters = this.freqs.map((f) => {
      const b = ctx.createBiquadFilter();
      b.type = "peaking";
      b.frequency.value = Math.min(f, ctx.sampleRate / 2 - 1);
      b.Q.value = q;
      b.gain.value = 0;
      return b;
    });
    for (let i = 0; i < this.filters.length - 1; i++) this.filters[i].connect(this.filters[i + 1]);
  }
  input(i: number) {
    return i === 0 ? { node: this.filters[0] as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return i === 0
      ? { node: this.filters[this.filters.length - 1] as AudioNode, channel: 0 }
      : null;
  }
  setGains(gainsDb: number[]) {
    for (let i = 0; i < this.filters.length; i++) {
      const g = gainsDb[i];
      if (typeof g === "number" && this.filters[i].gain.value !== g) {
        this.filters[i].gain.value = g;
      }
    }
  }
  bandFrequencies() {
    return this.freqs;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const f of this.filters) {
      try {
        f.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

// ---- Multi-value CV source (multislider, snapshot morph, selector) ---------
export interface MultiCVMonitor {
  setValues(values: number[]): void;
}

/** N independent control outputs, each a ConstantSourceNode the body writes into. */
export class MultiCVUnit implements AudioUnit, MultiCVMonitor {
  readonly numInputs = 0;
  readonly numOutputs: number;
  private sources: ConstantSourceNode[];

  constructor(ctx: BaseAudioContext, count: number, initial = 0) {
    this.numOutputs = count;
    this.sources = Array.from({ length: count }, () => {
      const s = ctx.createConstantSource();
      s.offset.value = initial;
      s.start();
      return s;
    });
  }
  input() {
    return null;
  }
  output(i: number) {
    const s = this.sources[i];
    return s ? { node: s as AudioNode, channel: 0 } : null;
  }
  setValues(values: number[]) {
    for (let i = 0; i < this.sources.length; i++) {
      const v = values[i];
      if (typeof v === "number" && this.sources[i].offset.value !== v) {
        this.sources[i].offset.value = v;
      }
    }
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const s of this.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}
