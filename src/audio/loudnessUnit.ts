/**
 * Stereo bus analysis (correlation, loudness, peak) measured on the audio thread.
 *
 * The previous version hung two AnalyserNodes off the bus and let the widgets poll them.
 * That does not just lose data in a background tab — it was wrong in the foreground too:
 * an analyser only ever holds its last 2048 samples (~46 ms), so a 100 ms poll never saw
 * more than half the audio, and "peak since the last call" silently skipped the rest.
 * A sample peak that misses half the samples is not a peak meter.
 *
 * Here every sample is examined once, in the audio thread, and the results are posted.
 * Peak is a true sample peak over the whole signal; loudness is a proper 400 ms momentary
 * window rather than whatever 46 ms happened to be resident. See faustmod-audio-thread.
 */
import type { AudioUnit } from "./types";

export interface StereoAnalysisMonitor {
  /** Pearson correlation of L/R over the window: +1 mono, 0 wide, -1 out of phase. */
  correlation(): number;
  /** Momentary loudness in LUFS (BS.1770 K-weighting, approximated). */
  lufs(): number;
  /** Peak sample magnitude across both channels since the last call. */
  peak(): number;
}

const LOUDNESS_PROCESSOR = "faustmod-loudness";
const loudnessRegistered = new WeakSet<BaseAudioContext>();

// K-weighting is a shelf plus a highpass; a 2nd-order highpass at 60 Hz gets most of the
// way there for a monitoring meter, and matches what the analyser-based version did.
// Correlation runs over a 2048-sample window so the number still reads like the old one;
// that window also sets the post rate (~46 ms at 44.1 kHz).
const LOUDNESS_CODE = `
const CORR_WINDOW = 2048;
const MOMENTARY_SEC = 0.4;
const MS_BLOCK = 512;

class Biquad {
  constructor(b0, b1, b2, a1, a2) {
    this.b0 = b0; this.b1 = b1; this.b2 = b2; this.a1 = a1; this.a2 = a2;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
            - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function highpass(freq, sr) {
  // RBJ cookbook highpass, Q = 1/sqrt(2).
  const w0 = 2 * Math.PI * freq / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const a0 = 1 + alpha;
  return new Biquad(
    ((1 + cos) / 2) / a0,
    (-(1 + cos)) / a0,
    ((1 + cos) / 2) / a0,
    (-2 * cos) / a0,
    (1 - alpha) / a0,
  );
}

class LoudnessProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.hpL = highpass(60, sampleRate);
    this.hpR = highpass(60, sampleRate);
    // Correlation accumulators over the current window.
    this.n = 0;
    this.sl = 0; this.sr = 0; this.sll = 0; this.srr = 0; this.slr = 0;
    this.corr = 0;
    // Momentary loudness: a ring of block mean-squares covering 400 ms.
    this.blocks = new Float64Array(Math.max(1, Math.round(MOMENTARY_SEC * sampleRate / MS_BLOCK)));
    this.blockAt = 0;
    this.blockSum = 0;
    this.blockN = 0;
    this.filled = 0;
    // True sample peak since the last post.
    this.peak = 0;
  }
  process(inputs) {
    const inp = inputs[0] || [];
    const chL = inp[0];
    const chR = inp[1] || inp[0];
    const frames = (chL && chL.length) || 128;
    for (let i = 0; i < frames; i++) {
      const rawL = chL ? chL[i] : 0;
      const rawR = chR ? chR[i] : 0;
      // Peak is the unweighted signal: it is about clipping, not about loudness.
      const aL = rawL < 0 ? -rawL : rawL;
      const aR = rawR < 0 ? -rawR : rawR;
      if (aL > this.peak) this.peak = aL;
      if (aR > this.peak) this.peak = aR;

      const l = this.hpL.run(rawL);
      const r = this.hpR.run(rawR);
      this.sl += l; this.sr += r;
      this.sll += l * l; this.srr += r * r; this.slr += l * r;

      this.blockSum += l * l + r * r;
      if (++this.blockN >= MS_BLOCK) {
        this.blocks[this.blockAt] = this.blockSum / (MS_BLOCK * 2);
        this.blockAt = (this.blockAt + 1) % this.blocks.length;
        if (this.filled < this.blocks.length) this.filled++;
        this.blockSum = 0;
        this.blockN = 0;
      }

      if (++this.n >= CORR_WINDOW) {
        const n = this.n;
        const cov = this.slr / n - (this.sl / n) * (this.sr / n);
        const vl = this.sll / n - (this.sl / n) * (this.sl / n);
        const vr = this.srr / n - (this.sr / n) * (this.sr / n);
        const d = Math.sqrt(vl * vr);
        this.corr = d < 1e-12 ? 0 : Math.max(-1, Math.min(1, cov / d));
        this.n = 0;
        this.sl = 0; this.sr = 0; this.sll = 0; this.srr = 0; this.slr = 0;

        let ms = 0;
        for (let b = 0; b < this.filled; b++) ms += this.blocks[b];
        ms = this.filled ? ms / this.filled : 0;
        this.port.postMessage({
          correlation: this.corr,
          lufs: ms <= 1e-12 ? -70 : -0.691 + 10 * Math.log10(ms),
          peak: this.peak,
        });
        this.peak = 0;
      }
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(LOUDNESS_PROCESSOR)}, LoudnessProcessor);
`;

async function ensureLoudnessModule(ctx: BaseAudioContext): Promise<void> {
  if (loudnessRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([LOUDNESS_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  loudnessRegistered.add(ctx);
}

/**
 * Stereo bus analysis for the correlation and loudness meters. Both read the same unit,
 * so one serves either widget.
 */
export class StereoAnalysisUnit implements AudioUnit, StereoAnalysisMonitor {
  readonly numInputs = 2;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;
  private corr = 0;
  private loud = -70;
  /** Highest peak reported since the widget last read it — draining, as documented. */
  private peakHold = 0;

  private constructor(
    ctx: BaseAudioContext,
    private node: AudioWorkletNode,
  ) {
    this.merger = ctx.createChannelMerger(2);
    this.merger.connect(this.node);
    // No output, so keep it pulled by the graph even with both inputs unpatched.
    this.node.connect(ctx.destination);
    this.node.port.onmessage = (e) => {
      const d = e.data as { correlation: number; lufs: number; peak: number };
      this.corr = d.correlation;
      this.loud = d.lufs;
      if (d.peak > this.peakHold) this.peakHold = d.peak;
    };
  }

  static async create(ctx: BaseAudioContext): Promise<StereoAnalysisUnit> {
    await ensureLoudnessModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, LOUDNESS_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    return new StereoAnalysisUnit(ctx, node);
  }

  input(i: number) {
    return i === 0 || i === 1 ? { node: this.merger as AudioNode, channel: i } : null;
  }
  output() {
    return null;
  }
  correlation() {
    return this.corr;
  }
  lufs() {
    return this.loud;
  }
  peak() {
    const p = this.peakHold;
    this.peakHold = 0;
    return p;
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
