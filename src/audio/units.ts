import type { FaustMonoAudioWorkletNode } from "@grame/faustwasm";
import type { AudioUnit, InputSpec } from "./types";
import { AudioDevices } from "./devices";

/**
 * Wraps a Faust AudioWorkletNode, exposing each Faust channel as an individual
 * mono port via a ChannelMerger (inputs) and ChannelSplitter (outputs).
 *
 * Control inputs (InputSpec with a `default`) are fed by an internal
 * ConstantSourceNode holding that default. When an external connection arrives on
 * such a port the default is detached so the incoming signal drives it.
 */
export class FaustUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  private merger: ChannelMergerNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private defaults: (ConstantSourceNode | null)[] = [];

  constructor(
    ctx: BaseAudioContext,
    private worklet: FaustMonoAudioWorkletNode,
    inputs: InputSpec[],
  ) {
    this.numInputs = worklet.getNumInputs();
    this.numOutputs = worklet.getNumOutputs();

    if (this.numInputs > 0) {
      this.merger = ctx.createChannelMerger(this.numInputs);
      this.merger.connect(worklet as unknown as AudioNode);

      for (let i = 0; i < this.numInputs; i++) {
        const def = inputs[i]?.default;
        if (def === undefined) {
          this.defaults[i] = null;
          continue;
        }
        const src = ctx.createConstantSource();
        src.offset.value = def;
        src.connect(this.merger, 0, i);
        src.start();
        this.defaults[i] = src;
      }
    }
    if (this.numOutputs > 0) {
      this.splitter = ctx.createChannelSplitter(this.numOutputs);
      (worklet as unknown as AudioNode).connect(this.splitter);
    }
  }

  input(i: number) {
    if (!this.merger || i < 0 || i >= this.numInputs) return null;
    return { node: this.merger as AudioNode, channel: i };
  }

  output(i: number) {
    if (!this.splitter || i < 0 || i >= this.numOutputs) return null;
    return { node: this.splitter as AudioNode, channel: i };
  }

  setValue() {}

  onInputConnected(i: number, connected: boolean) {
    const src = this.defaults[i];
    if (!src || !this.merger) return;
    try {
      if (connected) src.disconnect();
      else src.connect(this.merger, 0, i);
    } catch {
      /* already in the desired state */
    }
  }

  dispose() {
    try {
      this.defaults.forEach((s) => s && (s.disconnect(), s.stop()));
      this.merger?.disconnect();
      this.splitter?.disconnect();
      (this.worklet as unknown as AudioNode).disconnect();
      this.worklet.destroy?.();
    } catch {
      /* already torn down */
    }
  }
}

/** A constant DC signal source with one output port; its value is user-editable. */
export class ConstantUnit implements AudioUnit {
  readonly numInputs = 0;
  readonly numOutputs = 1;
  private source: ConstantSourceNode;
  private splitter: ChannelSplitterNode;

  constructor(ctx: BaseAudioContext, value: number) {
    this.source = ctx.createConstantSource();
    this.source.offset.value = value;
    this.splitter = ctx.createChannelSplitter(1);
    this.source.connect(this.splitter);
    this.source.start();
  }

  input() {
    return null;
  }
  output(i: number) {
    if (i !== 0) return null;
    return { node: this.splitter as AudioNode, channel: 0 };
  }
  setValue(value: number) {
    this.source.offset.value = value;
  }
  onInputConnected() {}
  dispose() {
    try {
      this.source.stop();
      this.source.disconnect();
      this.splitter.disconnect();
    } catch {
      /* noop */
    }
  }
}

/** The speakers: a stereo sink feeding the engine's master gain. */
export class OutputUnit implements AudioUnit {
  readonly numInputs = 2;
  readonly numOutputs = 0;
  private merger: ChannelMergerNode;

  constructor(ctx: BaseAudioContext, master: AudioNode) {
    this.merger = ctx.createChannelMerger(2);
    this.merger.connect(master);
  }

  input(i: number) {
    if (i < 0 || i >= 2) return null;
    return { node: this.merger as AudioNode, channel: i };
  }
  output() {
    return null;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.merger.disconnect();
    } catch {
      /* noop */
    }
  }
}

/** A stereo hardware input (microphone / line in) exposed as two mono output ports. */
export class InputUnit implements AudioUnit {
  readonly numInputs = 0;
  readonly numOutputs = 2;
  private splitter: ChannelSplitterNode;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  constructor(private ctx: BaseAudioContext) {
    this.splitter = ctx.createChannelSplitter(2);
  }

  async open() {
    if (this.source) return;
    const id = AudioDevices.inputDeviceId;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: id ? { deviceId: { exact: id } } : true,
    });
    this.source = (this.ctx as AudioContext).createMediaStreamSource(this.stream);
    this.source.connect(this.splitter);
  }

  input() {
    return null;
  }
  output(i: number) {
    if (i < 0 || i >= 2) return null;
    return { node: this.splitter as AudioNode, channel: i };
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.source?.disconnect();
      this.splitter.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* noop */
    }
  }
}
