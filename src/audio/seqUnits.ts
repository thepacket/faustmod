/**
 * Clocked pattern units: the audio side of the drum grid, piano roll, transport,
 * Euclidean circle, Turing machine and probability gate.
 *
 * They all share one worklet whose `mode` selects the behaviour, because they all need
 * the same core: watch a clock edge (or generate one), advance a position, and emit
 * triggers/CV with a short retrigger gap so downstream envelopes actually re-fire.
 */
import type { AudioUnit } from "./types";

export type SeqMode = "grid" | "roll" | "clock" | "euclid" | "turing" | "probability";

/** Grid/roll/euclid: the React body pushes the pattern and reads the playhead. */
export interface PatternMonitor {
  setPattern(pattern: unknown): void;
  position(): number;
  /** Transport only: running state, so the body's button reflects reality. */
  setRunning?(running: boolean): void;
  /** Turing only: the current shift-register contents, for the display. */
  register?(): number[];
  /** Drive a control input's fallback value from the body (e.g. the transport's BPM). */
  setInputDefault?(index: number, value: number): void;
}

const SEQ2_PROCESSOR = "faustmod-seq2";
const seq2Registered = new WeakSet<BaseAudioContext>();

// Inputs (single worklet input, one channel per port) and outputs by mode:
//   grid        in: clock, reset          out: one trigger per lane
//   roll        in: clock, reset          out: freq, gate, velocity
//   clock       in: run, bpm              out: clock, reset-out, bar
//   euclid      in: clock, reset          out: trigger
//   turing      in: clock, chance, range  out: cv, trigger
//   probability in: clock, chance         out: trigger
const SEQ2_CODE = `
class Seq2Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.mode = o.mode || "grid";
    this.lanes = o.lanes || 1;
    this.steps = o.steps || 16;
    this.cells = [];        // grid: [lane][step] booleans
    this.notes = [];        // roll: { step, len, midi, vel }
    this.euclid = [];       // euclid: booleans
    this.reg = [];          // turing: shift register of 0..1 values
    for (let i = 0; i < 16; i++) this.reg.push(Math.random());
    this.pos = -1;
    this.prevClock = 0;
    this.prevReset = 0;
    this.prevRun = 0;
    this.running = false;
    this.phase = 0;         // clock mode: 0..1 within a step
    this.trigHold = new Float32Array(64);
    this.gateLeft = 0;
    this.curFreq = 0;
    this.curVel = 0;
    this.cv = 0;
    this.trigLen = Math.max(1, Math.round(sampleRate * 0.005));
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.cells) this.cells = d.cells;
      if (d.notes) this.notes = d.notes;
      if (d.euclid) this.euclid = d.euclid;
      if (d.steps) this.steps = d.steps;
      if (d.running !== undefined) { this.running = d.running; if (!d.running) this.pos = -1; }
      if (d.reset) { this.pos = -1; this.phase = 0; }
    };
  }
  advance() {
    this.pos = (this.pos + 1) % Math.max(1, this.steps);
    this.port.postMessage({ pos: this.pos });
    if (this.mode === "grid") {
      for (let l = 0; l < this.lanes; l++) {
        const row = this.cells[l];
        if (row && row[this.pos]) this.trigHold[l] = this.trigLen;
      }
    } else if (this.mode === "roll") {
      const hits = this.notes.filter((n) => n.step === this.pos);
      if (hits.length) {
        const n = hits[0];
        this.curFreq = 440 * Math.pow(2, (n.midi - 69) / 12);
        this.curVel = n.vel === undefined ? 1 : n.vel;
        this.gateLeft = Math.max(1, n.len | 0);
        this.trigHold[0] = this.trigLen; // gate-low gap so envelopes retrigger
      } else if (this.gateLeft > 0) {
        this.gateLeft--;
      }
    } else if (this.mode === "euclid") {
      if (this.euclid[this.pos]) this.trigHold[0] = this.trigLen;
    }
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [];
    const out = outputs[0];
    const n = out[0].length;
    for (let i = 0; i < n; i++) {
      if (this.mode === "clock") {
        const run = inp[0] ? inp[0][i] : 0;
        const bpm = inp[1] ? inp[1][i] : 120;
        // A run input above 0.5 overrides the panel's button.
        const on = this.running || run > 0.5;
        let tick = false;
        if (on) {
          this.phase += (Math.max(1, bpm) / 60) * 4 / sampleRate; // 16ths
          if (this.phase >= 1) { this.phase -= 1; tick = true; this.advance(); }
        }
        out[0][i] = tick || this.trigHold[0] > 0 ? 1 : 0;
        if (tick) this.trigHold[0] = this.trigLen;
        if (out[1]) out[1][i] = this.pos === 0 && tick ? 1 : 0;
        if (out[2]) out[2][i] = this.pos / Math.max(1, this.steps);
      } else {
        const clock = inp[0] ? inp[0][i] : 0;
        const b = inp[1] ? inp[1][i] : 0;
        const c = inp[2] ? inp[2][i] : 0;
        if (this.mode === "turing" || this.mode === "probability") {
          if (this.prevClock <= 0.5 && clock > 0.5) {
            if (this.mode === "turing") {
              // Rotate the register; chance is the probability of mutating the
              // value that wraps around: 0 locks the loop, 1 randomises it.
              const head = this.reg.shift();
              const v = Math.random() < b ? Math.random() : head;
              this.reg.push(v);
              this.cv = v * (c || 1);
              this.trigHold[0] = this.trigLen;
              this.port.postMessage({ reg: this.reg.slice() });
            } else if (Math.random() < (b === 0 ? 0.5 : b)) {
              this.trigHold[0] = this.trigLen;
            }
          }
        } else {
          const reset = inp[1] ? inp[1][i] : 0;
          if (this.prevReset <= 0.5 && reset > 0.5) { this.pos = -1; }
          this.prevReset = reset;
          if (this.prevClock <= 0.5 && clock > 0.5) this.advance();
        }
        this.prevClock = clock;

        if (this.mode === "grid") {
          for (let l = 0; l < this.lanes; l++) {
            if (out[l]) out[l][i] = this.trigHold[l] > 0 ? 1 : 0;
          }
        } else if (this.mode === "roll") {
          out[0][i] = this.curFreq;
          if (out[1]) out[1][i] = this.gateLeft > 0 && this.trigHold[0] <= 0 ? 1 : 0;
          if (out[2]) out[2][i] = this.gateLeft > 0 ? this.curVel : 0;
        } else if (this.mode === "turing") {
          out[0][i] = this.cv;
          if (out[1]) out[1][i] = this.trigHold[0] > 0 ? 1 : 0;
        } else {
          out[0][i] = this.trigHold[0] > 0 ? 1 : 0;
        }
      }
      for (let l = 0; l < this.trigHold.length; l++) {
        if (this.trigHold[l] > 0) this.trigHold[l]--;
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(SEQ2_PROCESSOR)}, Seq2Processor);
`;

async function ensureSeq2Module(ctx: BaseAudioContext): Promise<void> {
  if (seq2Registered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([SEQ2_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  seq2Registered.add(ctx);
}

export class PatternUnit implements AudioUnit, PatternMonitor {
  readonly numInputs: number;
  readonly numOutputs: number;
  private merger: ChannelMergerNode;
  private splitter: ChannelSplitterNode;
  private defs: (ConstantSourceNode | null)[] = [];
  private pos = -1;
  private reg: number[] = [];

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
    numInputs: number,
    numOutputs: number,
    defaults: (number | undefined)[],
  ) {
    this.numInputs = numInputs;
    this.numOutputs = numOutputs;
    this.merger = ctx.createChannelMerger(Math.max(1, numInputs));
    this.merger.connect(this.node);
    this.splitter = ctx.createChannelSplitter(Math.max(1, numOutputs));
    this.node.connect(this.splitter);
    defaults.forEach((d, i) => {
      if (d === undefined) {
        this.defs[i] = null;
        return;
      }
      const src = ctx.createConstantSource();
      src.offset.value = d;
      src.connect(this.merger, 0, i);
      src.start();
      this.defs[i] = src;
    });
    this.node.port.onmessage = (e) => {
      if (typeof e.data.pos === "number") this.pos = e.data.pos;
      if (e.data.reg) this.reg = e.data.reg;
    };
  }

  static async create(
    ctx: BaseAudioContext,
    mode: SeqMode,
    opts: {
      numInputs: number;
      numOutputs: number;
      defaults: (number | undefined)[];
      lanes?: number;
      steps?: number;
    },
  ): Promise<PatternUnit> {
    await ensureSeq2Module(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, SEQ2_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [Math.max(1, opts.numOutputs)],
      channelCount: Math.max(1, opts.numInputs),
      channelCountMode: "explicit",
      processorOptions: { mode, lanes: opts.lanes ?? 1, steps: opts.steps ?? 16 },
    });
    return new PatternUnit(ctx, node, opts.numInputs, opts.numOutputs, opts.defaults);
  }

  input(i: number) {
    return i >= 0 && i < this.numInputs ? { node: this.merger as AudioNode, channel: i } : null;
  }
  output(i: number) {
    return i >= 0 && i < this.numOutputs
      ? { node: this.splitter as AudioNode, channel: i }
      : null;
  }
  setPattern(pattern: unknown) {
    this.node.port.postMessage(pattern as Record<string, unknown>);
  }
  setRunning(running: boolean) {
    this.node.port.postMessage({ running });
  }
  /** Update a control input's fallback source (ignored while a signal is wired in). */
  setInputDefault(index: number, value: number) {
    const src = this.defs[index];
    if (src && src.offset.value !== value) src.offset.value = value;
  }
  position() {
    return this.pos;
  }
  register() {
    return this.reg;
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
      this.node.port.onmessage = null;
      for (const s of this.defs) {
        if (!s) continue;
        s.stop();
        s.disconnect();
      }
      this.merger.disconnect();
      this.splitter.disconnect();
      this.node.disconnect();
    } catch {
      /* noop */
    }
  }
}

/** Euclidean rhythm: `pulses` hits spread as evenly as possible over `steps`. */
export function euclideanPattern(steps: number, pulses: number, rotate = 0): boolean[] {
  const n = Math.max(1, Math.floor(steps));
  const k = Math.max(0, Math.min(n, Math.floor(pulses)));
  const out = new Array<boolean>(n).fill(false);
  if (k === 0) return out;
  // Bresenham placement — same result as Bjorklund for our purposes, far less code.
  for (let i = 0; i < n; i++) out[i] = Math.floor((i * k) / n) !== Math.floor(((i + 1) * k) / n);
  if (!rotate) return out;
  const r = ((rotate % n) + n) % n;
  return out.slice(n - r).concat(out.slice(0, n - r));
}
