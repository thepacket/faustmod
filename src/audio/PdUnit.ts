import type { AudioUnit, InputSpec } from "./types";
import { compilePd, runPd } from "./PdEngine";

/**
 * Compile + run a Pd module via WebPd and wrap it as an AudioUnit. WebPd exposes a
 * worklet whose input channels are the module's adc~ channels (one FaustMod input port
 * each — audio and/or parameters) and whose output is its dac~ (stereo). A
 * ChannelMerger fans the ports into the worklet input; a ChannelSplitter breaks the
 * output into mono ports. Control inputs (with a declared default) hold that default
 * via a ConstantSource until something is wired in.
 */
export async function createPdUnit(
  ctx: AudioContext,
  code: string,
  inputs: InputSpec[],
  numOutputs: number,
): Promise<AudioUnit> {
  const channelCountIn = Math.max(2, inputs.length);
  const js = await compilePd(code, channelCountIn);
  const worklet = await runPd(ctx, js);
  return new PdUnit(ctx, worklet, inputs, numOutputs, channelCountIn);
}

class PdUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  private merger: ChannelMergerNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  // Per input channel: a ConstantSource holding the control default (null if none).
  private defaults: (ConstantSourceNode | null)[] = [];

  constructor(
    ctx: AudioContext,
    private worklet: AudioWorkletNode,
    inputs: InputSpec[],
    numOutputs: number,
    channelCountIn: number,
  ) {
    this.numInputs = inputs.length;
    this.numOutputs = numOutputs;

    if (this.numInputs > 0) {
      // Merger has one mono input per engine channel; port i drives adc~ channel i+1.
      this.merger = ctx.createChannelMerger(channelCountIn);
      this.merger.connect(worklet);
      inputs.forEach((spec, i) => {
        if (spec.default !== undefined) {
          const c = ctx.createConstantSource();
          c.offset.value = spec.default;
          c.connect(this.merger!, 0, i);
          c.start();
          this.defaults[i] = c;
        } else {
          this.defaults[i] = null;
        }
      });
    }
    if (numOutputs > 0) {
      this.splitter = ctx.createChannelSplitter(2); // WebPd output is stereo
      worklet.connect(this.splitter);
    }
  }

  input(i: number) {
    return this.merger && i >= 0 && i < this.numInputs
      ? { node: this.merger as AudioNode, channel: i }
      : null;
  }
  output(i: number) {
    return this.splitter && i >= 0 && i < this.numOutputs
      ? { node: this.splitter as AudioNode, channel: i }
      : null;
  }
  setValue() {}

  onInputConnected(i: number, connected: boolean) {
    const def = this.defaults[i];
    if (!def || !this.merger) return;
    try {
      // Wired → drop the default so the incoming signal is the sole driver of the channel.
      if (connected) def.disconnect();
      else def.connect(this.merger, 0, i);
    } catch {
      /* already in the desired state */
    }
  }

  dispose() {
    try {
      for (const c of this.defaults) {
        if (c) (c.disconnect(), c.stop());
      }
      this.worklet.disconnect();
      this.merger?.disconnect();
      this.splitter?.disconnect();
    } catch {
      /* already torn down */
    }
  }
}
