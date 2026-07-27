import { ClassicPreset } from "rete";
import type { ComponentDef } from "../components/library";
import type { InputSpec, OutputSpec } from "../audio/types";

/** Shared socket instance — every audio port uses the same "audio" socket type. */
export const audioSocket = new ClassicPreset.Socket("audio");

/** Socket key helpers keep the index encoding in one place. */
export const outKey = (i: number) => `out-${i}`;
export const inKey = (i: number) => `in-${i}`;
export const indexFromKey = (key: string) => parseInt(key.split("-")[1] ?? "0", 10);

/** Build the hover-tooltip text for an input port from its spec. */
function inputTip(spec: InputSpec): string {
  const bits: string[] = [];
  if (spec.default !== undefined) {
    const unit = spec.unit ? ` ${spec.unit}` : "";
    bits.push(`control input · default ${spec.default}${unit}`);
    if (spec.min !== undefined && spec.max !== undefined) {
      bits.push(`range ${spec.min}–${spec.max}`);
    }
  } else {
    bits.push("signal input · rests at 0 when unconnected");
  }
  const meta = bits.join(" · ");
  return spec.tooltip ? `${spec.tooltip}\n${meta}` : meta;
}

/** Build the hover-tooltip text for an output port from its spec. */
function outputTip(spec: OutputSpec): string {
  return spec.tooltip ? `${spec.tooltip}\noutput` : "output";
}

/**
 * A rete node backed by a library component. Input/output ports come from the
 * component's declared ports. Only Constant nodes carry an inline value control;
 * every other value is either the control input's own adjustable default (edited on
 * the port itself) or a signal wired into that input, which takes over while connected.
 *
 * `tips` maps each socket key to documentation shown as a hover tooltip; `tooltip`
 * documents the node itself. These are read by the themed node renderer.
 */
export class DspNode extends ClassicPreset.Node {
  readonly componentId: string;
  readonly category: string;
  readonly tooltip?: string;
  readonly tips: Record<string, string> = {};
  /** The declared spec (label/default/range/tooltip) per input socket key. */
  readonly inputSpecs: Record<string, InputSpec> = {};
  /** Per-instance overrides of control-input defaults, by socket key ("in-1"). */
  paramValues: Record<string, number> = {};
  /** Input socket keys that currently have a connection — the renderer greys their
   *  value field, since an incoming signal drives the port instead. */
  connectedInputs = new Set<string>();
  /** Set by the editor; pushes an edited control-input default into the audio graph. */
  onParamChange: ((nodeId: string, key: string, value: number) => void) | null = null;

  // Widget nodes (scope, meters, sequencer…) render a custom body.
  readonly widget?: string;
  readonly widgetConfig?: Record<string, unknown>;
  readonly resizable: boolean;
  width?: number;
  height?: number;
  widgetState: Record<string, unknown> = {};
  /** Edited Faust source (module editor override); undefined = stock module source. */
  code?: string;

  constructor(
    def: ComponentDef,
    private onValueChange: (nodeId: string, value: number) => void,
  ) {
    super(def.title);
    this.componentId = def.id;
    this.category = def.category;
    // On the canvas the bubble sits over the patch, so it gets our note plus the
    // library description — not the full usage/parameter text the palette shows.
    this.tooltip = [def.tooltip, def.doc?.split("\nUsage:")[0]].filter(Boolean).join("\n") || undefined;
    this.widget = def.widget;
    this.widgetConfig = def.widgetConfig;
    this.resizable = !!def.resizable;
    if (def.defaultSize) {
      this.width = def.defaultSize.w;
      this.height = def.defaultSize.h;
    }

    def.inputs.forEach((spec, i) => {
      const key = inKey(i);
      this.addInput(key, new ClassicPreset.Input(audioSocket, spec.label));
      this.tips[key] = inputTip(spec);
      this.inputSpecs[key] = spec;
    });
    def.outputs.forEach((spec, i) => {
      const key = outKey(i);
      this.addOutput(key, new ClassicPreset.Output(audioSocket, spec.label));
      this.tips[key] = outputTip(spec);
    });

    if (def.kind === "constant") {
      this.addControl(
        "value",
        new ClassicPreset.InputControl("number", {
          initial: def.value ?? 0,
          change: (value) => {
            const v = Number(value);
            if (Number.isFinite(v)) this.onValueChange(this.id, v);
          },
        }),
      );
    }
  }
}
