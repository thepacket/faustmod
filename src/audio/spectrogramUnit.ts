/**
 * The spectrogram's source: FFT columns computed and pushed by the audio thread.
 *
 * A waterfall is pure history — one column per frame, scrolled off the left edge. Polling
 * an AnalyserNode from a rAF loop meant every late frame was a column that never existed,
 * and a backgrounded tab produced a flat wall of nothing that looked exactly like silence.
 * There is no way to recover those columns afterwards, because the analyser only ever
 * holds its last 2048 samples.
 *
 * So the transform runs where the samples are. AnalyserNode isn't available in a worklet,
 * hence the radix-2 FFT below — 1024-point, Hann-windowed, hopping every 512 samples
 * (~86 columns/s at 44.1 kHz). Columns queue in the audio thread while the main thread is
 * frozen and are delivered as a backlog when it wakes, so the trace is continuous.
 *
 * The queue is capped in the unit: a tab left in the background overnight drops the
 * oldest columns rather than growing without bound.
 */
import type { AudioUnit } from "./types";

export interface SpectrogramMonitor {
  /** Columns produced since the last call, oldest first; each is `bins()` bytes. */
  take(): Uint8Array[];
  /** Magnitude bins per column, low frequency first. */
  bins(): number;
}

const SPECTRO_PROCESSOR = "faustmod-spectrogram";
const spectroRegistered = new WeakSet<BaseAudioContext>();

// Bytes are scaled over the same dB range AnalyserNode uses by default, so the heat map
// in the widget reads the same as it did before.
const SPECTRO_CODE = `
const N = 1024;
const HOP = 512;
const BINS = N / 2;
const BATCH = 8;
const MIN_DB = -100;
const MAX_DB = -30;

class FFT {
  constructor(n) {
    this.n = n;
    const bits = Math.round(Math.log2(n));
    this.rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / n);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / n);
    }
  }
  /** In-place complex FFT of re/im, both length n. */
  run(re, im) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const c = this.cos[k];
          const s = this.sin[k];
          const tr = re[j + half] * c - im[j + half] * s;
          const ti = re[j + half] * s + im[j + half] * c;
          re[j + half] = re[j] - tr;
          im[j + half] = im[j] - ti;
          re[j] += tr;
          im[j] += ti;
        }
      }
    }
  }
}

class SpectrogramProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.fft = new FFT(N);
    this.ring = new Float32Array(N);   // last N samples, circular
    this.at = 0;
    this.since = 0;
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.window = new Float32Array(N);
    let gain = 0;
    for (let i = 0; i < N; i++) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
      gain += this.window[i];
    }
    // Normalising by the window's sum makes a full-scale sine read ~0 dB, matching the
    // scaling AnalyserNode applies.
    this.norm = 2 / gain;
    this.pending = [];
  }
  column() {
    for (let i = 0; i < N; i++) {
      this.re[i] = this.ring[(this.at + i) % N] * this.window[i];
      this.im[i] = 0;
    }
    this.fft.run(this.re, this.im);
    const out = new Uint8Array(BINS);
    for (let b = 0; b < BINS; b++) {
      const mag = Math.sqrt(this.re[b] * this.re[b] + this.im[b] * this.im[b]) * this.norm;
      const db = mag <= 1e-12 ? MIN_DB : 20 * Math.log10(mag);
      const v = ((db - MIN_DB) / (MAX_DB - MIN_DB)) * 255;
      out[b] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    return out;
  }
  process(inputs) {
    const ch = (inputs[0] || [])[0];
    const frames = (ch && ch.length) || 128;
    for (let i = 0; i < frames; i++) {
      this.ring[this.at] = ch ? ch[i] : 0;
      this.at = (this.at + 1) % N;
      if (++this.since >= HOP) {
        this.since = 0;
        this.pending.push(this.column());
        if (this.pending.length >= BATCH) {
          // One flat buffer, transferred: BATCH separate arrays per message would be
          // BATCH structured clones every ~90 ms.
          const flat = new Uint8Array(this.pending.length * BINS);
          for (let c = 0; c < this.pending.length; c++) flat.set(this.pending[c], c * BINS);
          this.pending = [];
          this.port.postMessage({ bins: BINS, data: flat }, [flat.buffer]);
        }
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(SPECTRO_PROCESSOR)}, SpectrogramProcessor);
`;

async function ensureSpectroModule(ctx: BaseAudioContext): Promise<void> {
  if (spectroRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([SPECTRO_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  spectroRegistered.add(ctx);
}

/** Columns retained while the widget isn't drawing — ~24 s, well past any canvas width. */
const MAX_PENDING = 2048;

export class SpectrogramUnit implements AudioUnit, SpectrogramMonitor {
  readonly numInputs = 1;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;
  private queue: Uint8Array[] = [];
  private binCount = 512;

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
  ) {
    this.merger = ctx.createChannelMerger(1);
    this.merger.connect(this.node);
    // No output, so keep it pulled by the graph even with the input unpatched.
    this.node.connect(ctx.destination);
    this.node.port.onmessage = (e) => {
      const d = e.data as { bins: number; data: Uint8Array };
      this.binCount = d.bins;
      for (let c = 0; c < d.data.length; c += d.bins) {
        this.queue.push(d.data.subarray(c, c + d.bins));
      }
      if (this.queue.length > MAX_PENDING) {
        this.queue.splice(0, this.queue.length - MAX_PENDING);
      }
    };
  }

  static async create(ctx: BaseAudioContext): Promise<SpectrogramUnit> {
    await ensureSpectroModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, SPECTRO_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
    });
    return new SpectrogramUnit(ctx, node);
  }

  input(i: number) {
    return i === 0 ? { node: this.merger as AudioNode, channel: 0 } : null;
  }
  output() {
    return null;
  }
  take() {
    const q = this.queue;
    this.queue = [];
    return q;
  }
  bins() {
    return this.binCount;
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
