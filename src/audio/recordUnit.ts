/**
 * The Record widget's "on" input, watched from the audio thread.
 *
 * Polling a meter every 100 ms means a gate shorter than that can open and close between
 * two reads and never start a recording at all, and the level strip has a hole wherever a
 * frame was late. Here the audio thread measures the gate every ~12 ms, reports each
 * transition as an event stamped with the audio clock, and streams the level alongside.
 * The events queue while the main thread is frozen and arrive intact when it wakes, so
 * the widget always ends up in the state the signal actually asked for.
 *
 * The recorder itself still starts on the main thread, so a backgrounded tab means a late
 * start, not a missed one — that part is not ours to fix from the audio thread.
 */
import type { AudioUnit } from "./types";

export interface RecordEdge {
  /** AudioContext time in seconds of the transition. */
  t: number;
  on: boolean;
}

export interface RecordSample {
  t: number;
  v: number;
}

export interface RecordMonitor {
  /** Gate transitions since the last call, oldest first. */
  takeEdges(): RecordEdge[];
  /** Retained level history, oldest first. */
  levels(): RecordSample[];
  /** Gate state as of the last message from the audio thread. */
  isOn(): boolean;
}

const RECORD_PROCESSOR = "faustmod-record";
const recordRegistered = new WeakSet<BaseAudioContext>();

// RMS over WINDOW samples (~12 ms) decides the gate, which keeps the old meter-based
// semantics — an audio-rate signal crossing zero must not read as "off" — at eight times
// the resolution. Batches keep the message rate close to the old poll rate.
const RECORD_CODE = `
const WINDOW = 512;
const BATCH = 8;
const THRESHOLD = 1e-3;
class RecordProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sum = 0;
    this.count = 0;
    this.on = false;
    this.levels = [];
    this.edges = [];
  }
  process(inputs) {
    const ch = (inputs[0] || [])[0];
    const frames = (ch && ch.length) || 128;
    for (let i = 0; i < frames; i++) {
      const x = ch ? ch[i] : 0;
      this.sum += x * x;
      if (++this.count >= WINDOW) {
        const rms = Math.sqrt(this.sum / WINDOW);
        this.sum = 0;
        this.count = 0;
        const t = currentTime + i / sampleRate;
        this.levels.push({ t, v: rms });
        const on = rms > THRESHOLD;
        if (on !== this.on) {
          this.on = on;
          this.edges.push({ t, on });
          // Send the transition immediately: the recorder should not wait on a batch.
          this.flush();
        } else if (this.levels.length >= BATCH) {
          this.flush();
        }
      }
    }
    return true;
  }
  flush() {
    this.port.postMessage({ levels: this.levels, edges: this.edges, on: this.on });
    this.levels = [];
    this.edges = [];
  }
}
registerProcessor(${JSON.stringify(RECORD_PROCESSOR)}, RecordProcessor);
`;

async function ensureRecordModule(ctx: BaseAudioContext): Promise<void> {
  if (recordRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([RECORD_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  recordRegistered.add(ctx);
}

/** Seconds of level history retained — a long background stretch can't grow the queue. */
const HISTORY_SEC = 30;

export class RecordUnit implements AudioUnit, RecordMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;
  private samples: RecordSample[] = [];
  private edges: RecordEdge[] = [];
  private on = false;

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
  ) {
    this.merger = ctx.createChannelMerger(1);
    this.merger.connect(this.node);
    // No output, so keep it pulled by the graph even with the input unpatched.
    this.node.connect(ctx.destination);
    this.node.port.onmessage = (e) => {
      const d = e.data as { levels: RecordSample[]; edges: RecordEdge[]; on: boolean };
      this.on = d.on;
      if (d.edges.length) this.edges.push(...d.edges);
      if (!d.levels.length) return;
      this.samples.push(...d.levels);
      const cutoff = this.samples[this.samples.length - 1].t - HISTORY_SEC;
      while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    };
  }

  static async create(ctx: BaseAudioContext): Promise<RecordUnit> {
    await ensureRecordModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, RECORD_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    return new RecordUnit(ctx, node);
  }

  input(i: number) {
    return i === 0 ? { node: this.merger as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  takeEdges() {
    const e = this.edges;
    this.edges = [];
    return e;
  }
  levels() {
    return this.samples;
  }
  isOn() {
    return this.on;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.node.port.onmessage = null;
      this.merger.disconnect();
      this.node.disconnect();
    } catch {
      /* noop */
    }
  }
}
