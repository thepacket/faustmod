/**
 * The CV Plotter's source: the audio thread pushes samples instead of the UI pulling
 * them.
 *
 * Polling from the main thread means a background tab or a janky frame simply misses
 * data — the plot has real holes in it, and the widget can only mark them. Pushing turns
 * that around: the audio thread decimates and timestamps on its own clock, and
 * postMessage queues while the main thread is frozen, so the backlog is delivered intact
 * when the tab wakes. Nothing is lost, and no stall markers are needed because there is
 * no gap to explain.
 *
 * The history is capped in the unit, so a tab left in the background for an hour cannot
 * grow the queue without bound.
 */
import type { AudioUnit, InputSpec } from "./types";

export interface PlotSample {
  /** AudioContext time in seconds — the audio clock, not the UI's. */
  t: number;
  v: number[];
}

export interface PlotMonitor {
  /** Samples within the retained window, oldest first. */
  history(): PlotSample[];
  channels(): number;
  /** Seconds of history retained. */
  windowSec(): number;
}

const PLOT_PROCESSOR = "faustmod-plot";
const plotRegistered = new WeakSet<BaseAudioContext>();

// Averages each input over DECIMATE samples (~10 ms) and ships them in small batches.
// Mean rather than last-sample so an audio-rate input reads as its DC level, matching
// what the widget documents.
const PLOT_CODE = `
const DECIMATE = 512;
const BATCH = 8;
class PlotProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = (options.processorOptions && options.processorOptions.channels) || 4;
    this.sums = new Float64Array(this.channels);
    this.count = 0;
    this.batch = [];
  }
  process(inputs) {
    const inp = inputs[0] || [];
    const frames = (inp[0] && inp[0].length) || 128;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < this.channels; c++) {
        const ch = inp[c];
        this.sums[c] += ch ? ch[i] : 0;
      }
      if (++this.count >= DECIMATE) {
        const v = new Array(this.channels);
        for (let c = 0; c < this.channels; c++) {
          v[c] = this.sums[c] / DECIMATE;
          this.sums[c] = 0;
        }
        this.count = 0;
        // currentTime is the audio clock and keeps running regardless of the UI.
        this.batch.push({ t: currentTime + i / sampleRate, v });
        if (this.batch.length >= BATCH) {
          this.port.postMessage(this.batch);
          this.batch = [];
        }
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(PLOT_PROCESSOR)}, PlotProcessor);
`;

async function ensurePlotModule(ctx: BaseAudioContext): Promise<void> {
  if (plotRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([PLOT_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  plotRegistered.add(ctx);
}

const WINDOW_SEC = 12;

export class PlotUnit implements AudioUnit, PlotMonitor {
  readonly numInputs: number;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;
  private samples: PlotSample[] = [];

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
    inputs: number,
  ) {
    this.numInputs = inputs;
    this.merger = ctx.createChannelMerger(Math.max(1, inputs));
    this.merger.connect(this.node);
    // A processor with no output is still pulled as long as something feeds it, but
    // connecting to the destination keeps it alive even with every input unpatched.
    this.node.connect(ctx.destination);
    this.node.port.onmessage = (e) => {
      const batch = e.data as PlotSample[];
      if (!Array.isArray(batch) || batch.length === 0) return;
      this.samples.push(...batch);
      const cutoff = batch[batch.length - 1].t - WINDOW_SEC;
      while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    };
  }

  static async create(ctx: BaseAudioContext, inputs: InputSpec[]): Promise<PlotUnit> {
    await ensurePlotModule(ctx);
    const channels = Math.max(1, inputs.length);
    const node = new AudioWorkletNode(ctx as AudioContext, PLOT_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: channels,
      channelCountMode: "explicit",
      processorOptions: { channels },
    });
    return new PlotUnit(ctx, node, channels);
  }

  input(i: number) {
    return i >= 0 && i < this.numInputs ? { node: this.merger as AudioNode, channel: i } : null;
  }
  output() {
    return null;
  }
  history() {
    return this.samples;
  }
  channels() {
    return this.numInputs;
  }
  windowSec() {
    return WINDOW_SEC;
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
