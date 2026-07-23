import type { AudioUnit } from "./types";
import { compilePd, runPd } from "./PdEngine";

/**
 * Compile + run a Pd module via WebPd and wrap it as an AudioUnit. WebPd exposes a
 * stereo worklet (its adc~/dac~ channels); a ChannelMerger fans the node's mono input
 * ports into the worklet's input, and a ChannelSplitter breaks the worklet's output
 * back into mono output ports — so it wires into the graph like any other unit.
 */
export async function createPdUnit(
  ctx: AudioContext,
  code: string,
  numInputs: number,
  numOutputs: number,
): Promise<AudioUnit> {
  // Compile the engine to read as many input channels as the module has ports (audio +
  // parameters), so each FaustMod input port maps to one adc~ channel.
  const channelCountIn = Math.max(2, numInputs);
  const js = await compilePd(code, channelCountIn);
  const worklet = await runPd(ctx, js);
  return new PdUnit(ctx, worklet, numInputs, numOutputs, channelCountIn);
}

class PdUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  private merger: ChannelMergerNode | null = null;
  private splitter: ChannelSplitterNode | null = null;

  constructor(
    ctx: AudioContext,
    private worklet: AudioWorkletNode,
    numInputs: number,
    numOutputs: number,
    channelCountIn: number,
  ) {
    this.numInputs = numInputs;
    this.numOutputs = numOutputs;
    if (numInputs > 0) {
      // Merger has one mono input per engine channel; port i drives adc~ channel i+1.
      this.merger = ctx.createChannelMerger(channelCountIn);
      this.merger.connect(worklet);
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
  onInputConnected() {}
  dispose() {
    try {
      this.worklet.disconnect();
      this.merger?.disconnect();
      this.splitter?.disconnect();
    } catch {
      /* noop */
    }
  }
}
