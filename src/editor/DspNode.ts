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
    bits.push("signal input");
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
 * all other values arrive by wiring a node into a control input.
 *
 * `tips` maps each socket key to documentation shown as a hover tooltip; `tooltip`
 * documents the node itself. These are read by the themed node renderer.
 */
export class DspNode extends ClassicPreset.Node {
  readonly componentId: string;
  readonly category: string;
  readonly tooltip?: string;
  readonly tips: Record<string, string> = {};

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
    this.tooltip = def.tooltip;
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
