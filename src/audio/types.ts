/**
 * A node input port. Every input is a mono audio-rate signal channel. If `default`
 * is defined, the port is a "control" input: when nothing is connected a
 * ConstantSourceNode holding `default` drives it. If `default` is undefined, the
 * port is a plain signal input (silent when unconnected).
 */
export interface InputSpec {
  label: string;
  default?: number;
  min?: number;
  max?: number;
  unit?: string;
  /** Human description shown in the port's hover tooltip. */
  tooltip?: string;
  /**
   * For example "module" nodes: the Faust UI param address this control input
   * drives (via the worklet's AudioParam). Absent on plain audio signal inputs.
   */
  paramPath?: string;
}

export interface OutputSpec {
  label: string;
  /** Human description shown in the port's hover tooltip. */
  tooltip?: string;
}

/** Static audio shape of a component, known before audio starts. */
export interface DspShape {
  inputs: InputSpec[];
  outputs: OutputSpec[];
}

/**
 * A realized audio unit in the running graph. Ports are per-channel (mono):
 * input port `i` / output port `i` correspond to Faust channel `i`.
 */
export interface AudioUnit {
  readonly numInputs: number;
  readonly numOutputs: number;
  /** Node + channel to connect an upstream signal INTO for input port `i`. */
  input(i: number): { node: AudioNode; channel: number } | null;
  /** Node + channel to take output port `i` FROM. */
  output(i: number): { node: AudioNode; channel: number } | null;
  /** Set the emitted value of a Constant unit. No-op elsewhere. */
  setValue(value: number): void;
  /**
   * Toggle whether input port `i` has an external connection. When connected, the
   * port's fallback default source (if any) is detached so the external signal
   * drives it; when disconnected, the default is restored.
   */
  onInputConnected(i: number, connected: boolean): void;
  /** Tear down and disconnect all internal nodes. */
  dispose(): void;
}
