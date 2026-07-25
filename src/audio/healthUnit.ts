/**
 * Audio-thread health probe.
 *
 * The CV Plotter and every meter sample on the main thread, so a background tab or a
 * janky frame makes them *look* like the audio broke when it didn't. This measures the
 * audio thread from inside it, where main-thread throttling cannot reach.
 *
 * The measurement has to account for how Chrome actually renders: not one callback per
 * quantum, but a burst of quanta back-to-back to fill the device buffer, then a sleep.
 * So the normal gap between callbacks is one *buffer period* (tens of ms), not one
 * quantum (~2.7 ms) — thresholding on the quantum flags every burst boundary and reports
 * thousands of phantom glitches. The probe therefore learns the burst period and only
 * counts gaps well beyond it, which is what a missed deadline looks like.
 *
 * Counters accumulate on the audio thread and are posted periodically, so they stay
 * accurate even while the main thread is frozen and cannot read them.
 */
import type { AudioUnit } from "./types";

export interface HealthMonitor {
  stats(): { gaps: number; worstMs: number; periodMs: number; quanta: number };
  reset(): void;
}

const HEALTH_PROCESSOR = "faustmod-health";
const healthRegistered = new WeakSet<BaseAudioContext>();

const HEALTH_CODE = `
class HealthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.last = 0;
    this.period = 0;   // learned burst period, ms
    this.seen = 0;     // inter-burst gaps observed (warm-up counter)
    this.gaps = 0;
    this.worst = 0;
    this.quanta = 0;
    this.sincePost = 0;
    this.port.onmessage = (e) => {
      if (e.data && e.data.reset) {
        this.gaps = 0; this.worst = 0; this.quanta = 0; this.last = 0;
        this.period = 0; this.seen = 0;
      }
    };
  }
  process() {
    const now = Date.now();
    if (this.last) {
      const dt = now - this.last;
      // Gaps inside a burst are ~0; only the sleep between bursts is informative.
      if (dt >= 1) {
        this.period = this.period === 0 ? dt : this.period + (dt - this.period) * 0.02;
        // Warm up before judging, then allow generous headroom over the learned period
        // so ordinary scheduling wobble doesn't register.
        if (this.seen > 100 && dt > Math.max(this.period * 2.5, this.period + 20)) {
          this.gaps++;
          if (dt > this.worst) this.worst = dt;
        }
        this.seen++;
      }
    }
    this.last = now;
    this.quanta++;
    if (++this.sincePost >= 128) { // ~340 ms
      this.sincePost = 0;
      this.port.postMessage({
        gaps: this.gaps,
        worstMs: this.worst,
        periodMs: this.period,
        quanta: this.quanta,
      });
    }
    return true;
  }
}
registerProcessor(${JSON.stringify(HEALTH_PROCESSOR)}, HealthProcessor);
`;

async function ensureHealthModule(ctx: BaseAudioContext): Promise<void> {
  if (healthRegistered.has(ctx)) return;
  const url = URL.createObjectURL(new Blob([HEALTH_CODE], { type: "text/javascript" }));
  await (ctx as AudioContext).audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  healthRegistered.add(ctx);
}

export class HealthUnit implements AudioUnit, HealthMonitor {
  readonly numInputs = 0;
  readonly numOutputs = 0;
  private latest = { gaps: 0, worstMs: 0, periodMs: 0, quanta: 0 };

  private constructor(private node: AudioWorkletNode) {
    this.node.port.onmessage = (e) => {
      this.latest = e.data;
    };
  }

  static async create(ctx: BaseAudioContext): Promise<HealthUnit> {
    await ensureHealthModule(ctx);
    const node = new AudioWorkletNode(ctx as AudioContext, HEALTH_PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    // A processor with no consumer may be skipped, so keep it pulled by the graph.
    // It emits nothing, so connecting it to the destination is silent.
    node.connect(ctx.destination);
    return new HealthUnit(node);
  }

  input() {
    return null;
  }
  output() {
    return null;
  }
  stats() {
    return this.latest;
  }
  reset() {
    this.node.port.postMessage({ reset: true });
    this.latest = { ...this.latest, gaps: 0, worstMs: 0, quanta: 0 };
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
