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
  /** Per-step on/off. Off steps output freq but hold gate/velocity low. */
  setGates(gates: boolean[]): void;
  /** Per-step velocity, 0..1. */
  setVelocities(vels: number[]): void;
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

// Three output channels: freq, gate, velocity. The clock (input 0) advances the
// step on each rising edge; the gate briefly drops at each step boundary so that
// consecutive on-steps still retrigger an envelope.
const SEQ_CODE = `
class SeqProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = 0;
    this.freqs = [0];
    this.gates = [true];
    this.vels = [1];
    this.prev = 0;
    this.since = 1e9;
    this.retrig = Math.max(1, Math.round(sampleRate * 0.003)); // ~3 ms gate-low on step change
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.freqs) this.freqs = d.freqs;
      if (d.gates) this.gates = d.gates;
      if (d.vels) this.vels = d.vels;
      if (d.reset) { this.step = 0; this.since = 0; this.port.postMessage({ step: 0 }); }
    };
  }
  process(inputs, outputs) {
    const clock = inputs[0] && inputs[0][0];
    const fout = outputs[0][0];
    const gout = outputs[0][1];
    const vout = outputs[0][2];
    const n = this.freqs.length || 1;
    for (let i = 0; i < fout.length; i++) {
      const c = clock ? clock[i] : 0;
      this.since++;
      if (this.prev <= 0.5 && c > 0.5) {
        this.step = (this.step + 1) % n;
        this.since = 0;
        this.port.postMessage({ step: this.step });
      }
      this.prev = c;
      const on = this.gates[this.step] === false ? 0 : 1;
      fout[i] = this.freqs[this.step] || 0;
      if (gout) gout[i] = on && this.since >= this.retrig ? 1 : 0;
      if (vout) vout[i] = on ? (this.vels[this.step] ?? 1) : 0;
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
    this.splitter = ctx.createChannelSplitter(3);
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
      outputChannelCount: [3],
    });
    return new SequencerUnit(ctx, node, freqs);
  }

  input(i: number) {
    return i === 0 ? { node: this.merger as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return i >= 0 && i < 3 ? { node: this.splitter as AudioNode, channel: i } : null;
  }
  setFrequencies(freqs: number[]) {
    this.node.port.postMessage({ freqs });
  }
  setGates(gates: boolean[]) {
    this.node.port.postMessage({ gates });
  }
  setVelocities(vels: number[]) {
    this.node.port.postMessage({ vels });
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

// ---- XY pad (two control outputs) ----------------------------------------
export interface Vec2Monitor {
  setXY(x: number, y: number): void;
}

export class Vec2Unit implements AudioUnit, Vec2Monitor {
  readonly numInputs = 0;
  readonly numOutputs = 2;
  private xs: ConstantSourceNode;
  private ys: ConstantSourceNode;

  constructor(ctx: BaseAudioContext, x = 0.5, y = 0.5) {
    this.xs = ctx.createConstantSource();
    this.ys = ctx.createConstantSource();
    this.xs.offset.value = x;
    this.ys.offset.value = y;
    this.xs.start();
    this.ys.start();
  }
  input() {
    return null;
  }
  output(i: number) {
    const s = i === 0 ? this.xs : i === 1 ? this.ys : null;
    return s ? { node: s as AudioNode, channel: 0 } : null;
  }
  setXY(x: number, y: number) {
    this.xs.offset.value = x;
    this.ys.offset.value = y;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.xs.stop();
      this.ys.stop();
      this.xs.disconnect();
      this.ys.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Sample player (custom AudioWorklet) ---------------------------------
const SAMPLER_PROCESSOR = "faustmod-sampler";
const samplerRegistered = new WeakSet<BaseAudioContext>();

// input 0 = trigger, input 1 = rate. Two output channels (L/R). A rising edge on
// the trigger restarts playback from the start; rate scales speed/pitch.
const SAMPLER_CODE = `
class SamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chL = new Float32Array(0);
    this.chR = new Float32Array(0);
    this.len = 0;
    this.pos = 0;
    this.playing = false;
    this.prev = 0;
    this.sr = 1;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.buffer) {
        this.chL = d.buffer[0] || new Float32Array(0);
        this.chR = d.buffer[1] || this.chL;
        this.len = this.chL.length;
        this.sr = d.srRatio || 1;
        this.pos = 0;
        this.playing = false;
      }
    };
  }
  process(inputs, outputs) {
    const trig = inputs[0] && inputs[0][0];
    const rate = inputs[0] && inputs[0][1];
    const outL = outputs[0][0];
    const outR = outputs[0][1];
    for (let i = 0; i < outL.length; i++) {
      const t = trig ? trig[i] : 0;
      if (this.prev <= 0.5 && t > 0.5 && this.len > 1) { this.pos = 0; this.playing = true; }
      this.prev = t;
      let l = 0, r = 0;
      if (this.playing) {
        const p = this.pos | 0;
        if (p >= this.len - 1) { this.playing = false; }
        else {
          const frac = this.pos - p;
          l = this.chL[p] * (1 - frac) + this.chL[p + 1] * frac;
          r = this.chR[p] * (1 - frac) + this.chR[p + 1] * frac;
          const rr = (rate ? rate[i] : 1) * this.sr;
          this.pos += rr > 0 ? rr : 0;
        }
      }
      outL[i] = l;
      if (outR) outR[i] = r;
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(SAMPLER_PROCESSOR)}, SamplerProcessor);
`;

async function ensureSamplerModule(ctx: BaseAudioContext): Promise<void> {
  if (samplerRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([SAMPLER_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  samplerRegistered.add(ctx);
}

export interface SamplerMonitor {
  loadBuffer(channels: Float32Array[], bufferSampleRate: number): void;
  hasBuffer(): boolean;
}

export class SamplerUnit implements AudioUnit, SamplerMonitor {
  readonly numInputs = 2;
  readonly numOutputs = 2;
  private merger: ChannelMergerNode;
  private splitter: ChannelSplitterNode;
  private rateDefault: ConstantSourceNode;
  private loaded = false;

  private constructor(
    private ctx: BaseAudioContext,
    private node: AudioWorkletNode,
  ) {
    this.merger = ctx.createChannelMerger(2);
    this.merger.connect(this.node);
    this.splitter = ctx.createChannelSplitter(2);
    this.node.connect(this.splitter);
    // Internal default (1×) for the rate input, detached when a signal is wired in.
    this.rateDefault = ctx.createConstantSource();
    this.rateDefault.offset.value = 1;
    this.rateDefault.connect(this.merger, 0, 1);
    this.rateDefault.start();
  }

  static async create(ctx: BaseAudioContext): Promise<SamplerUnit> {
    await ensureSamplerModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, SAMPLER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    return new SamplerUnit(ctx, node);
  }

  input(i: number) {
    return i >= 0 && i < 2 ? { node: this.merger as AudioNode, channel: i } : null;
  }
  output(i: number) {
    return i >= 0 && i < 2 ? { node: this.splitter as AudioNode, channel: i } : null;
  }
  loadBuffer(channels: Float32Array[], bufferSampleRate: number) {
    this.node.port.postMessage({
      buffer: channels,
      srRatio: bufferSampleRate / this.ctx.sampleRate,
    });
    this.loaded = true;
  }
  hasBuffer() {
    return this.loaded;
  }
  setValue() {}
  onInputConnected(i: number, connected: boolean) {
    if (i !== 1) return;
    try {
      if (connected) this.rateDefault.disconnect();
      else this.rateDefault.connect(this.merger, 0, 1);
    } catch {
      /* already in desired state */
    }
  }
  dispose() {
    try {
      this.rateDefault.stop();
      this.rateDefault.disconnect();
      this.merger.disconnect();
      this.splitter.disconnect();
      this.node.disconnect();
    } catch {
      /* noop */
    }
  }
}

// ---- Granular cloud (custom AudioWorklet) --------------------------------
const GRANULAR_PROCESSOR = "faustmod-granular";
const granularRegistered = new WeakSet<BaseAudioContext>();

// Control inputs (channels): 0 position(0..1), 1 grain size(ms), 2 density(Hz),
// 3 pitch, 4 spray(0..1). Continuously spawns overlapping Hann-windowed grains
// read from the loaded buffer. Preallocated grain pool — no audio-thread alloc.
const GRANULAR_CODE = `
class GranularProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chL = new Float32Array(0);
    this.chR = new Float32Array(0);
    this.len = 0;
    this.srRatio = 1;
    this.max = 48;
    this.gPos = new Float32Array(this.max);
    this.gRate = new Float32Array(this.max);
    this.gI = new Float32Array(this.max);
    this.gN = new Float32Array(this.max);
    this.gOn = new Uint8Array(this.max);
    this.countdown = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.buffer) {
        this.chL = d.buffer[0] || new Float32Array(0);
        this.chR = d.buffer[1] || this.chL;
        this.len = this.chL.length;
        this.srRatio = d.srRatio || 1;
        this.gOn.fill(0);
      }
    };
  }
  spawn(pos, sizeMs, pitch, spray) {
    let slot = -1;
    for (let k = 0; k < this.max; k++) if (!this.gOn[k]) { slot = k; break; }
    if (slot < 0) return;
    const len = this.len;
    const n = Math.max(4, (Math.max(1, sizeMs) * 0.001 * sampleRate) | 0);
    let start = pos * len + (Math.random() * 2 - 1) * spray * len;
    start = ((start % len) + len) % len;
    this.gPos[slot] = start;
    this.gRate[slot] = pitch * this.srRatio;
    this.gI[slot] = 0;
    this.gN[slot] = n;
    this.gOn[slot] = 1;
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [];
    const posC = inp[0], sizeC = inp[1], densC = inp[2], pitchC = inp[3], sprayC = inp[4];
    const outL = outputs[0][0];
    const outR = outputs[0][1];
    const len = this.len;
    const TWO_PI = 2 * Math.PI;
    for (let s = 0; s < outL.length; s++) {
      if (len > 1) {
        this.countdown -= 1;
        if (this.countdown <= 0) {
          const dens = Math.max(0.1, densC ? densC[s] : 20);
          this.countdown += sampleRate / dens;
          this.spawn(
            posC ? posC[s] : 0,
            sizeC ? sizeC[s] : 80,
            pitchC ? pitchC[s] : 1,
            sprayC ? sprayC[s] : 0.1,
          );
        }
      }
      let l = 0, r = 0;
      for (let k = 0; k < this.max; k++) {
        if (!this.gOn[k]) continue;
        const i = this.gI[k], n = this.gN[k];
        const w = 0.5 - 0.5 * Math.cos((TWO_PI * i) / n);
        let p = this.gPos[k];
        if (p >= len) p -= len;
        const ip = p | 0;
        const frac = p - ip;
        const ip1 = ip + 1 >= len ? 0 : ip + 1;
        l += (this.chL[ip] * (1 - frac) + this.chL[ip1] * frac) * w;
        r += (this.chR[ip] * (1 - frac) + this.chR[ip1] * frac) * w;
        this.gPos[k] = p + this.gRate[k];
        this.gI[k] = i + 1;
        if (i + 1 >= n) this.gOn[k] = 0;
      }
      outL[s] = l * 0.5;
      if (outR) outR[s] = r * 0.5;
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(GRANULAR_PROCESSOR)}, GranularProcessor);
`;

async function ensureGranularModule(ctx: BaseAudioContext): Promise<void> {
  if (granularRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([GRANULAR_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  granularRegistered.add(ctx);
}

export class GranularUnit implements AudioUnit, SamplerMonitor {
  readonly numInputs = 5;
  readonly numOutputs = 2;
  private merger: ChannelMergerNode;
  private splitter: ChannelSplitterNode;
  private defaults: ConstantSourceNode[] = [];
  private loaded = false;
  // pos, size(ms), density(Hz), pitch, spray — unconnected control-input fallbacks.
  private static DEFAULTS = [0, 80, 20, 1, 0.1];

  private constructor(
    private ctx: BaseAudioContext,
    private node: AudioWorkletNode,
  ) {
    this.merger = ctx.createChannelMerger(5);
    this.merger.connect(this.node);
    this.splitter = ctx.createChannelSplitter(2);
    this.node.connect(this.splitter);
    GranularUnit.DEFAULTS.forEach((v, i) => {
      const s = ctx.createConstantSource();
      s.offset.value = v;
      s.connect(this.merger, 0, i);
      s.start();
      this.defaults[i] = s;
    });
  }

  static async create(ctx: BaseAudioContext): Promise<GranularUnit> {
    await ensureGranularModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, GRANULAR_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 5,
      channelCountMode: "explicit",
    });
    return new GranularUnit(ctx, node);
  }

  input(i: number) {
    return i >= 0 && i < 5 ? { node: this.merger as AudioNode, channel: i } : null;
  }
  output(i: number) {
    return i >= 0 && i < 2 ? { node: this.splitter as AudioNode, channel: i } : null;
  }
  loadBuffer(channels: Float32Array[], bufferSampleRate: number) {
    this.node.port.postMessage({
      buffer: channels,
      srRatio: bufferSampleRate / this.ctx.sampleRate,
    });
    this.loaded = true;
  }
  hasBuffer() {
    return this.loaded;
  }
  setValue() {}
  onInputConnected(i: number, connected: boolean) {
    const s = this.defaults[i];
    if (!s) return;
    try {
      if (connected) s.disconnect();
      else s.connect(this.merger, 0, i);
    } catch {
      /* already in desired state */
    }
  }
  dispose() {
    try {
      this.defaults.forEach((s) => (s.stop(), s.disconnect()));
      this.merger.disconnect();
      this.splitter.disconnect();
      this.node.disconnect();
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
