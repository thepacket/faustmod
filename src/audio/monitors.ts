import type { AudioUnit } from "./types";

/**
 * Bridge between the audio graph (which owns the AnalyserNodes / worklets) and the
 * React node bodies that visualize them. Keyed by the node's id (same id the editor
 * and AudioGraph use). Populated when a widget node is realized, cleared on stop.
 */
export const Monitors = new Map<string, unknown>();

// ---- Monitor interfaces the React widgets consume ------------------------
export interface MeterMonitor {
  /** Smoothed RMS level of the input, 0..~1. */
  level(): number;
}
export interface ScopeMonitor {
  readSignal(buf: Float32Array): void;
  readTrigger(buf: Float32Array): void;
  /** True if a trigger signal is connected/active. */
  hasTrigger(): boolean;
}
export interface SpectrumMonitor {
  readFreq(buf: Uint8Array): void;
  binCount(): number;
  sampleRate(): number;
}
export interface SeqMonitor {
  setFrequencies(freqs: number[]): void;
  currentStep(): number;
}

// ---- Level meter (LEDs, analog + digital voltmeters) ---------------------
export class MeterUnit implements AudioUnit, MeterMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;
  private analyser: AnalyserNode;
  private buf: Float32Array;

  constructor(ctx: BaseAudioContext) {
    this.merger = ctx.createChannelMerger(1);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.merger.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
  }
  input(i: number) {
    return i === 0 ? { node: this.merger as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  level(): number {
    this.analyser.getFloatTimeDomainData(this.buf as Float32Array<ArrayBuffer>);
    let s = 0;
    for (const v of this.buf) s += v * v;
    return Math.sqrt(s / this.buf.length);
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.merger.disconnect();
      this.analyser.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Oscilloscope (signal + trigger inputs) ------------------------------
export class ScopeUnit implements AudioUnit, ScopeMonitor {
  readonly numInputs = 2;
  readonly numOutputs = 0;
  private sigMerger: ChannelMergerNode;
  private trigMerger: ChannelMergerNode;
  private sigAnalyser: AnalyserNode;
  private trigAnalyser: AnalyserNode;
  private triggerConnected = false;

  constructor(ctx: BaseAudioContext) {
    this.sigMerger = ctx.createChannelMerger(1);
    this.sigAnalyser = ctx.createAnalyser();
    this.sigAnalyser.fftSize = 2048;
    this.sigMerger.connect(this.sigAnalyser);

    this.trigMerger = ctx.createChannelMerger(1);
    this.trigAnalyser = ctx.createAnalyser();
    this.trigAnalyser.fftSize = 2048;
    this.trigMerger.connect(this.trigAnalyser);
  }
  input(i: number) {
    if (i === 0) return { node: this.sigMerger as AudioNode, channel: 0 };
    if (i === 1) return { node: this.trigMerger as AudioNode, channel: 0 };
    return null;
  }
  output() {
    return null;
  }
  readSignal(buf: Float32Array) {
    this.sigAnalyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
  }
  readTrigger(buf: Float32Array) {
    this.trigAnalyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>);
  }
  hasTrigger() {
    return this.triggerConnected;
  }
  setValue() {}
  onInputConnected(i: number, connected: boolean) {
    if (i === 1) this.triggerConnected = connected;
  }
  dispose() {
    try {
      this.sigMerger.disconnect();
      this.sigAnalyser.disconnect();
      this.trigMerger.disconnect();
      this.trigAnalyser.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Spectrogram / spectrum ----------------------------------------------
export class SpectrumUnit implements AudioUnit, SpectrumMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;
  private analyser: AnalyserNode;
  private ctx: BaseAudioContext;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.merger = ctx.createChannelMerger(1);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.5;
    this.merger.connect(this.analyser);
  }
  input(i: number) {
    return i === 0 ? { node: this.merger as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  readFreq(buf: Uint8Array) {
    this.analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>);
  }
  binCount() {
    return this.analyser.frequencyBinCount;
  }
  sampleRate() {
    return this.ctx.sampleRate;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.merger.disconnect();
      this.analyser.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Step sequencer (custom AudioWorklet) --------------------------------
const SEQ_PROCESSOR = "faustmod-sequencer";
const registered = new WeakSet<BaseAudioContext>();

const SEQ_CODE = `
class SeqProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = 0;
    this.freqs = [0];
    this.prev = 0;
    this.port.onmessage = (e) => {
      if (e.data.freqs) this.freqs = e.data.freqs;
      if (e.data.reset) { this.step = 0; this.port.postMessage({ step: 0 }); }
    };
  }
  process(inputs, outputs) {
    const clock = inputs[0] && inputs[0][0];
    const out = outputs[0][0];
    const n = this.freqs.length || 1;
    for (let i = 0; i < out.length; i++) {
      const c = clock ? clock[i] : 0;
      if (this.prev <= 0.5 && c > 0.5) {
        this.step = (this.step + 1) % n;
        this.port.postMessage({ step: this.step });
      }
      this.prev = c;
      out[i] = this.freqs[this.step] || 0;
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(SEQ_PROCESSOR)}, SeqProcessor);
`;

async function ensureSeqModule(ctx: BaseAudioContext): Promise<void> {
  if (registered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([SEQ_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  registered.add(ctx);
}

export class SequencerUnit implements AudioUnit, SeqMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 1;
  private merger: ChannelMergerNode;
  private splitter: ChannelSplitterNode;
  private step = 0;

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
    freqs: number[],
  ) {
    this.merger = ctx.createChannelMerger(1);
    this.merger.connect(this.node);
    this.splitter = ctx.createChannelSplitter(1);
    this.node.connect(this.splitter);
    this.node.port.onmessage = (e) => {
      if (typeof e.data.step === "number") this.step = e.data.step;
    };
    this.setFrequencies(freqs);
  }

  static async create(ctx: BaseAudioContext, freqs: number[]): Promise<SequencerUnit> {
    await ensureSeqModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, SEQ_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    return new SequencerUnit(ctx, node, freqs);
  }

  input(i: number) {
    return i === 0 ? { node: this.merger as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return i === 0 ? { node: this.splitter as AudioNode, channel: 0 } : null;
  }
  setFrequencies(freqs: number[]) {
    this.node.port.postMessage({ freqs });
  }
  currentStep() {
    return this.step;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.node.port.onmessage = null;
      this.merger.disconnect();
      this.splitter.disconnect();
      this.node.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Note source (keyboard / MIDI): freq + gate [+ velocity] outputs --------
export interface GateFreqMonitor {
  noteOn(midi: number, velocity?: number): void;
  noteOff(midi: number): void;
  activeNote(): number | null;
  setStatus?(s: string): void;
  getStatus?(): string;
}

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class GateFreqUnit implements AudioUnit, GateFreqMonitor {
  readonly numInputs = 0;
  readonly numOutputs: number;
  private freqSrc: ConstantSourceNode;
  private gateSrc: ConstantSourceNode;
  private velSrc: ConstantSourceNode | null;
  private held: number[] = []; // held notes (last-note priority, monophonic)
  private status = "";

  constructor(ctx: BaseAudioContext, withVelocity: boolean) {
    this.numOutputs = withVelocity ? 3 : 2;
    this.freqSrc = ctx.createConstantSource();
    this.freqSrc.offset.value = 220;
    this.gateSrc = ctx.createConstantSource();
    this.gateSrc.offset.value = 0;
    this.velSrc = withVelocity ? ctx.createConstantSource() : null;
    if (this.velSrc) this.velSrc.offset.value = 0;
    this.freqSrc.start();
    this.gateSrc.start();
    this.velSrc?.start();
  }

  input() {
    return null;
  }
  output(i: number) {
    const src = i === 0 ? this.freqSrc : i === 1 ? this.gateSrc : this.velSrc;
    return src ? { node: src as AudioNode, channel: 0 } : null;
  }

  noteOn(midi: number, velocity = 100) {
    this.held = this.held.filter((n) => n !== midi);
    this.held.push(midi);
    this.freqSrc.offset.value = midiToHz(midi);
    this.gateSrc.offset.value = 1;
    if (this.velSrc) this.velSrc.offset.value = velocity / 127;
  }
  noteOff(midi: number) {
    this.held = this.held.filter((n) => n !== midi);
    if (this.held.length) {
      this.freqSrc.offset.value = midiToHz(this.held[this.held.length - 1]);
    } else {
      this.gateSrc.offset.value = 0;
    }
  }
  activeNote() {
    return this.held.length ? this.held[this.held.length - 1] : null;
  }
  setStatus(s: string) {
    this.status = s;
  }
  getStatus() {
    return this.status;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.freqSrc.stop();
      this.gateSrc.stop();
      this.velSrc?.stop();
      this.freqSrc.disconnect();
      this.gateSrc.disconnect();
      this.velSrc?.disconnect();
    } catch {
      /* noop */
    }
  }
}

/** A no-op unit for widgets with no audio (e.g. comment/label). */
export class NullUnit implements AudioUnit {
  readonly numInputs = 0;
  readonly numOutputs = 0;
  input() {
    return null;
  }
  output() {
    return null;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {}
}
