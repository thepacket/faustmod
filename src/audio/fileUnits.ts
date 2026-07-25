/**
 * Units that hold audio the user brings in or captures: the impulse-response convolver
 * and the looper.
 */
import type { AudioUnit } from "./types";

// ---- Convolution reverb (IR loader) --------------------------------------
export interface ConvolverMonitor {
  loadImpulse(buffer: AudioBuffer): void;
  hasImpulse(): boolean;
  setMix(mix: number): void;
}

/**
 * Convolution via the native ConvolverNode, with a dry/wet crossfade. The IR itself is
 * a file the user loads — a real space, a cabinet, a plate — which is the one reverb
 * flavour an algorithmic network can't fake.
 */
export class ConvolverUnit implements AudioUnit, ConvolverMonitor {
  readonly numInputs = 1; // audio in (mix comes from the body)
  readonly numOutputs = 2;
  private inNode: GainNode;
  private conv: ConvolverNode;
  private dry: GainNode;
  private wet: GainNode;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  private loaded = false;

  constructor(ctx: BaseAudioContext) {
    this.inNode = ctx.createGain();
    this.conv = ctx.createConvolver();
    this.conv.normalize = true;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0.7;
    this.wet.gain.value = 0.3;
    this.merger = ctx.createChannelMerger(2);
    this.splitter = ctx.createChannelSplitter(2);

    this.inNode.connect(this.dry);
    this.inNode.connect(this.conv);
    this.conv.connect(this.wet);
    // Both paths sum into a stereo pair the graph can take L/R from.
    this.dry.connect(this.merger, 0, 0);
    this.dry.connect(this.merger, 0, 1);
    this.wet.connect(this.merger, 0, 0);
    this.wet.connect(this.merger, 0, 1);
    this.merger.connect(this.splitter);
  }
  input(i: number) {
    // Port 1 (mix) is driven from the body, not the graph, so only port 0 is wired.
    return i === 0 ? { node: this.inNode as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return i >= 0 && i < 2 ? { node: this.splitter as AudioNode, channel: i } : null;
  }
  loadImpulse(buffer: AudioBuffer) {
    this.conv.buffer = buffer;
    this.loaded = true;
  }
  hasImpulse() {
    return this.loaded;
  }
  setMix(mix: number) {
    const m = Math.max(0, Math.min(1, mix));
    this.wet.gain.value = m;
    this.dry.gain.value = 1 - m;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const n of [this.inNode, this.conv, this.dry, this.wet, this.merger, this.splitter]) {
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

// ---- Looper ---------------------------------------------------------------
export interface LooperMonitor {
  setMode(mode: "idle" | "record" | "play" | "overdub"): void;
  clear(): void;
  /** 0..1 position through the loop, for the playhead. */
  position(): number;
  /** Recorded loop length in seconds (0 = nothing recorded yet). */
  length(): number;
}

const LOOPER_PROCESSOR = "faustmod-looper";
const looperRegistered = new WeakSet<BaseAudioContext>();

// A fixed 30 s circular buffer. Record defines the loop length on the first pass;
// overdub sums into what's already there; play just reads.
const LOOPER_CODE = `
class LooperProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(sampleRate * 30);
    this.len = 0;
    this.pos = 0;
    this.mode = "idle";
    this.uiCountdown = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.mode) {
        if (d.mode === "record" && this.mode !== "record") { this.len = 0; this.pos = 0; }
        if (d.mode === "play" && this.mode === "record") { this.len = this.pos; this.pos = 0; }
        this.mode = d.mode;
      }
      if (d.clear) { this.buf.fill(0); this.len = 0; this.pos = 0; this.mode = "idle"; }
    };
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      const x = inp ? inp[i] : 0;
      if (this.mode === "record") {
        if (this.pos < this.buf.length) this.buf[this.pos++] = x;
        out[i] = x;
      } else if (this.len > 0) {
        if (this.mode === "overdub") this.buf[this.pos] += x;
        out[i] = this.buf[this.pos] + x;
        if (++this.pos >= this.len) this.pos = 0;
      } else {
        out[i] = x;
      }
    }
    // The playhead only feeds a UI poll running at 60 ms, so posting every quantum
    // (375 messages a second, each an allocation on the audio thread) buys nothing and
    // adds cross-thread pressure exactly when the machine is already busy.
    if (--this.uiCountdown <= 0) {
      this.uiCountdown = 16; // ~43 ms at 128-sample quanta
      this.port.postMessage({ pos: this.len ? this.pos / this.len : 0, len: this.len / sampleRate });
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(LOOPER_PROCESSOR)}, LooperProcessor);
`;

async function ensureLooperModule(ctx: BaseAudioContext): Promise<void> {
  if (looperRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([LOOPER_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  looperRegistered.add(ctx);
}

export class LooperUnit implements AudioUnit, LooperMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 1;
  private pos = 0;
  private len = 0;

  private constructor(private node: AudioWorkletNode) {
    this.node.port.onmessage = (e) => {
      if (typeof e.data.pos === "number") this.pos = e.data.pos;
      if (typeof e.data.len === "number") this.len = e.data.len;
    };
  }

  static async create(ctx: BaseAudioContext): Promise<LooperUnit> {
    await ensureLooperModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, LOOPER_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    return new LooperUnit(node);
  }

  input(i: number) {
    return i === 0 ? { node: this.node as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return i === 0 ? { node: this.node as AudioNode, channel: 0 } : null;
  }
  setMode(mode: "idle" | "record" | "play" | "overdub") {
    this.node.port.postMessage({ mode });
  }
  clear() {
    this.node.port.postMessage({ clear: true });
  }
  position() {
    return this.pos;
  }
  length() {
    return this.len;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.node.port.onmessage = null;
      this.node.disconnect();
    } catch {
      /* noop */
    }
  }
}
