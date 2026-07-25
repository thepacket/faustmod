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

/**
 * Log-spaced band centres. Exported so the widget can label its dots with the same
 * frequencies the filters actually use, even before the audio graph is built.
 */
export function eqBandFrequencies(bands = 10, low = 31.25, high = 16000): number[] {
  const ratio = Math.pow(high / low, 1 / Math.max(1, bands - 1));
  return Array.from({ length: bands }, (_, i) => low * Math.pow(ratio, i));
}

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
    this.freqs = eqBandFrequencies(bands, low, high);
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

// ---- Multi-input probe (MIDI Out, value monitors) -------------------------
export interface ProbeMonitor {
  /** Instantaneous level of input `i` (mean of the analyser window, so DC survives). */
  level(i: number): number;
}

/**
 * Taps N inputs with analysers so a React body can read their values at control rate.
 * Unlike MeterUnit this reports the *mean* rather than RMS, so a steady CV (a pitch in
 * Hz, a held gate) reads as its actual value instead of its energy.
 */
export class ProbeUnit implements AudioUnit, ProbeMonitor {
  readonly numInputs: number;
  readonly numOutputs = 0;
  private analysers: AnalyserNode[];
  private buf: Float32Array;

  constructor(ctx: BaseAudioContext, inputs: number) {
    this.numInputs = inputs;
    this.analysers = Array.from({ length: inputs }, () => {
      const a = ctx.createAnalyser();
      a.fftSize = 1024;
      return a;
    });
    this.buf = new Float32Array(1024);
  }
  input(i: number) {
    const a = this.analysers[i];
    return a ? { node: a as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  level(i: number) {
    const a = this.analysers[i];
    if (!a) return 0;
    a.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>);
    let s = 0;
    for (const v of this.buf) s += v;
    return s / this.buf.length;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const a of this.analysers) {
      try {
        a.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

// ---- Stereo analysis: correlation + loudness ------------------------------
export interface StereoAnalysisMonitor {
  /** Pearson correlation of L/R over the window: +1 mono, 0 wide, -1 out of phase. */
  correlation(): number;
  /** Momentary loudness in LUFS (BS.1770 K-weighting, approximated). */
  lufs(): number;
  /** Peak sample magnitude across both channels since the last call. */
  peak(): number;
}

/**
 * Stereo bus analysis for the correlation and loudness meters. Both read the same two
 * analysers, so one unit serves either widget.
 */
export class StereoAnalysisUnit implements AudioUnit, StereoAnalysisMonitor {
  readonly numInputs = 2;
  readonly numOutputs = 0;
  private aL: AnalyserNode;
  private aR: AnalyserNode;
  private bufL: Float32Array;
  private bufR: Float32Array;
  // K-weighting is a shelf + highpass; a plain highpass at 60 Hz on the analysis path
  // gets most of the way there for a monitoring meter without a full biquad chain.
  private hpL: BiquadFilterNode;
  private hpR: BiquadFilterNode;

  constructor(ctx: BaseAudioContext) {
    const mk = () => {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      return a;
    };
    this.aL = mk();
    this.aR = mk();
    const hp = () => {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 60;
      return f;
    };
    this.hpL = hp();
    this.hpR = hp();
    this.hpL.connect(this.aL);
    this.hpR.connect(this.aR);
    this.bufL = new Float32Array(2048);
    this.bufR = new Float32Array(2048);
  }
  private read() {
    this.aL.getFloatTimeDomainData(this.bufL as Float32Array<ArrayBuffer>);
    this.aR.getFloatTimeDomainData(this.bufR as Float32Array<ArrayBuffer>);
  }
  input(i: number) {
    const n = i === 0 ? this.hpL : i === 1 ? this.hpR : null;
    return n ? { node: n as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  correlation() {
    this.read();
    let sl = 0, sr = 0, sll = 0, srr = 0, slr = 0;
    const n = this.bufL.length;
    for (let i = 0; i < n; i++) {
      const l = this.bufL[i];
      const r = this.bufR[i];
      sl += l;
      sr += r;
      sll += l * l;
      srr += r * r;
      slr += l * r;
    }
    const cov = slr / n - (sl / n) * (sr / n);
    const vl = sll / n - (sl / n) ** 2;
    const vr = srr / n - (sr / n) ** 2;
    const d = Math.sqrt(vl * vr);
    return d < 1e-12 ? 0 : Math.max(-1, Math.min(1, cov / d));
  }
  lufs() {
    this.read();
    let s = 0;
    for (let i = 0; i < this.bufL.length; i++) {
      s += this.bufL[i] * this.bufL[i] + this.bufR[i] * this.bufR[i];
    }
    const meanSquare = s / (this.bufL.length * 2);
    return meanSquare <= 1e-12 ? -70 : -0.691 + 10 * Math.log10(meanSquare);
  }
  peak() {
    this.read();
    let p = 0;
    for (let i = 0; i < this.bufL.length; i++) {
      p = Math.max(p, Math.abs(this.bufL[i]), Math.abs(this.bufR[i]));
    }
    return p;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const n of [this.hpL, this.hpR, this.aL, this.aR]) {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

// ---- Multi-trace scope / CV plotter ---------------------------------------
export interface TracesMonitor {
  /** Fill `out` with the latest window of input `i`. */
  readTrace(i: number, out: Float32Array): void;
  /** Instantaneous (mean) value of input `i`, for slow control signals. */
  value(i: number): number;
  traceCount(): number;
}

/** N analysers, one per input, for the multi-trace scope and the CV plotter. */
export class TracesUnit implements AudioUnit, TracesMonitor {
  readonly numInputs: number;
  readonly numOutputs = 0;
  private analysers: AnalyserNode[];
  private scratch: Float32Array;

  constructor(ctx: BaseAudioContext, inputs: number, fftSize = 2048) {
    this.numInputs = inputs;
    this.analysers = Array.from({ length: inputs }, () => {
      const a = ctx.createAnalyser();
      a.fftSize = fftSize;
      return a;
    });
    this.scratch = new Float32Array(fftSize);
  }
  input(i: number) {
    const a = this.analysers[i];
    return a ? { node: a as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  readTrace(i: number, out: Float32Array) {
    const a = this.analysers[i];
    if (a) a.getFloatTimeDomainData(out as Float32Array<ArrayBuffer>);
    else out.fill(0);
  }
  value(i: number) {
    const a = this.analysers[i];
    if (!a) return 0;
    a.getFloatTimeDomainData(this.scratch as Float32Array<ArrayBuffer>);
    let s = 0;
    for (const v of this.scratch) s += v;
    return s / this.scratch.length;
  }
  traceCount() {
    return this.analysers.length;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const a of this.analysers) {
      try {
        a.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}
