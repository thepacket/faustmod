import type { FaustMonoAudioWorkletNode } from "@grame/faustwasm";
import type { AudioUnit, InputSpec } from "./types";
import { AudioDevices } from "./devices";

/** Drop the leading `/<dsp-name>` segment so param addresses match regardless of the
 *  (cache-dependent) compile name Faust baked into them. */
const paramTail = (p: string) => p.replace(/^\/[^/]+/, "");

/** Find a worklet AudioParam by address, tolerating a differing `/<name>` prefix. */
function findParam(params: AudioParamMap, path: string): AudioParam | undefined {
  const exact = params.get(path);
  if (exact) return exact;
  const want = paramTail(path);
  let found: AudioParam | undefined;
  params.forEach((param, addr) => {
    if (!found && paramTail(addr) === want) found = param;
  });
  return found;
}

/**
 * Wraps a Faust AudioWorkletNode, exposing each declared input as an individual mono
 * port. Two kinds of control input are supported so a user's DSP works however they
 * declared it:
 *   - a Faust UI param (hslider/nentry/button, carries `paramPath`) binds to the
 *     matching AudioParam; unconnected it holds the param default, wired it's driven
 *     by the incoming signal;
 *   - a plain signal input (audio channel) with a `default` is fed by an internal
 *     ConstantSourceNode until a connection detaches it.
 */
export class FaustUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  private merger: ChannelMergerNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  private ports: (
    | { kind: "audio"; channel: number; def: ConstantSourceNode | null }
    | { kind: "param"; gain: GainNode; param: AudioParam; init: number }
    | null
  )[] = [];

  constructor(
    ctx: BaseAudioContext,
    private worklet: FaustMonoAudioWorkletNode,
    inputs: InputSpec[],
  ) {
    const numAudioIn = worklet.getNumInputs();
    this.numOutputs = worklet.getNumOutputs();
    this.numInputs = inputs.length;

    if (numAudioIn > 0) {
      this.merger = ctx.createChannelMerger(numAudioIn);
      this.merger.connect(worklet as unknown as AudioNode);
    }
    if (this.numOutputs > 0) {
      this.splitter = ctx.createChannelSplitter(this.numOutputs);
      (worklet as unknown as AudioNode).connect(this.splitter);
    }

    const params = (worklet as unknown as AudioWorkletNode).parameters;
    let audioIdx = 0;
    inputs.forEach((spec, i) => {
      const param = spec.paramPath ? findParam(params, spec.paramPath) : undefined;
      if (param) {
        const init = spec.default ?? param.defaultValue;
        param.value = init;
        const gain = ctx.createGain();
        gain.connect(param);
        this.ports[i] = { kind: "param", gain, param, init };
      } else if (this.merger && audioIdx < numAudioIn) {
        const channel = audioIdx++;
        let def: ConstantSourceNode | null = null;
        if (spec.default !== undefined) {
          def = ctx.createConstantSource();
          def.offset.value = spec.default;
          def.connect(this.merger, 0, channel);
          def.start();
        }
        this.ports[i] = { kind: "audio", channel, def };
      } else {
        this.ports[i] = null;
      }
    });
  }

  input(i: number) {
    const p = this.ports[i];
    if (!p) return null;
    if (p.kind === "audio") return { node: this.merger as AudioNode, channel: p.channel };
    return { node: p.gain as AudioNode, channel: 0 };
  }

  output(i: number) {
    if (!this.splitter || i < 0 || i >= this.numOutputs) return null;
    return { node: this.splitter as AudioNode, channel: i };
  }

  setValue() {}

  onInputConnected(i: number, connected: boolean) {
    const p = this.ports[i];
    if (!p) return;
    try {
      if (p.kind === "param") {
        // While wired, zero the param so the incoming signal is the sole driver.
        p.param.value = connected ? 0 : p.init;
      } else if (p.def && this.merger) {
        if (connected) p.def.disconnect();
        else p.def.connect(this.merger, 0, p.channel);
      }
    } catch {
      /* already in the desired state */
    }
  }

  dispose() {
    try {
      for (const p of this.ports) {
        if (p?.kind === "param") p.gain.disconnect();
        else if (p?.kind === "audio" && p.def) (p.def.disconnect(), p.def.stop());
      }
      this.merger?.disconnect();
      this.splitter?.disconnect();
      (this.worklet as unknown as AudioNode).disconnect();
      this.worklet.destroy?.();
    } catch {
      /* already torn down */
    }
  }
}

/**
 * A Faust "module" unit (precompiled-factory path). Like FaustUnit for audio
 * channels, but its Faust UI params are exposed as extra CONTROL INPUTS: each param
 * input is a pass-through GainNode feeding the worklet's matching AudioParam. When
 * unconnected the param sits at its Faust default; when a signal is wired in, the
 * default is zeroed so the incoming signal fully drives it (add → replace).
 */
export class ModuleUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  private merger: ChannelMergerNode | null = null;
  private splitter: ChannelSplitterNode | null = null;
  // Per input port: either an audio channel index, or a driven AudioParam.
  private ports: (
    | { kind: "audio"; channel: number }
    | { kind: "param"; gain: GainNode; param: AudioParam; init: number }
    | null
  )[] = [];

  constructor(
    ctx: BaseAudioContext,
    private worklet: FaustMonoAudioWorkletNode,
    inputs: InputSpec[],
  ) {
    const numAudioIn = worklet.getNumInputs();
    this.numOutputs = worklet.getNumOutputs();
    this.numInputs = inputs.length;

    if (numAudioIn > 0) {
      this.merger = ctx.createChannelMerger(numAudioIn);
      this.merger.connect(worklet as unknown as AudioNode);
    }
    if (this.numOutputs > 0) {
      this.splitter = ctx.createChannelSplitter(this.numOutputs);
      (worklet as unknown as AudioNode).connect(this.splitter);
    }

    const params = (worklet as unknown as AudioWorkletNode).parameters;
    let audioIdx = 0;
    inputs.forEach((spec, i) => {
      if (spec.paramPath) {
        const param = params.get(spec.paramPath);
        if (param) {
          const init = spec.default ?? param.defaultValue;
          param.value = init;
          const gain = ctx.createGain();
          gain.connect(param);
          this.ports[i] = { kind: "param", gain, param, init };
        } else {
          this.ports[i] = null; // param address not found on the node
        }
      } else if (this.merger && audioIdx < numAudioIn) {
        this.ports[i] = { kind: "audio", channel: audioIdx++ };
      } else {
        this.ports[i] = null;
      }
    });
  }

  input(i: number) {
    const p = this.ports[i];
    if (!p) return null;
    if (p.kind === "audio") return { node: this.merger as AudioNode, channel: p.channel };
    return { node: p.gain as AudioNode, channel: 0 };
  }
  output(i: number) {
    if (!this.splitter || i < 0 || i >= this.numOutputs) return null;
    return { node: this.splitter as AudioNode, channel: i };
  }
  setValue() {}
  onInputConnected(i: number, connected: boolean) {
    const p = this.ports[i];
    if (p?.kind === "param") p.param.value = connected ? 0 : p.init;
  }
  dispose() {
    try {
      for (const p of this.ports) if (p?.kind === "param") p.gain.disconnect();
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

/**
 * Placeholder for an embedded-patch node: exposes the right number of input/output
 * ports (silent) so the node realizes without error. The real implementation
 * (flattening the child subgraph and wiring it to these boundaries) replaces this.
 */
export class PatchStubUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  private ins: GainNode[];
  private outs: GainNode[];

  constructor(ctx: BaseAudioContext, numInputs: number, numOutputs: number) {
    this.numInputs = numInputs;
    this.numOutputs = numOutputs;
    this.ins = Array.from({ length: numInputs }, () => ctx.createGain());
    this.outs = Array.from({ length: numOutputs }, () => ctx.createGain());
  }

  input(i: number) {
    return this.ins[i] ? { node: this.ins[i] as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return this.outs[i] ? { node: this.outs[i] as AudioNode, channel: 0 } : null;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    for (const g of [...this.ins, ...this.outs]) {
      try {
        g.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}

/**
 * A patch I/O terminal — a single mono passthrough (one GainNode). Defines a port on
 * the boundary of a patch: "in" exposes one OUTPUT (signal the parent will feed in),
 * "out" exposes one INPUT (signal the parent will read out). At the top level it's
 * inert (an "in" is silent, an "out" is a sink); embedding wires the parent to `gain`.
 */
export class TerminalUnit implements AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  /** The boundary node the embedding logic connects the parent graph to/from. */
  readonly gain: GainNode;

  constructor(ctx: BaseAudioContext, direction: "in" | "out") {
    this.gain = ctx.createGain();
    this.numInputs = direction === "out" ? 1 : 0;
    this.numOutputs = direction === "in" ? 1 : 0;
  }

  input(i: number) {
    return this.numInputs && i === 0 ? { node: this.gain as AudioNode, channel: 0 } : null;
  }
  output(i: number) {
    return this.numOutputs && i === 0 ? { node: this.gain as AudioNode, channel: 0 } : null;
  }
  setValue() {}
  onInputConnected() {}
  dispose() {
    try {
      this.gain.disconnect();
    } catch {
      /* noop */
    }
  }
}
