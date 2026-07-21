import type { InputSpec, OutputSpec } from "../audio/types";
import generatedCatalog from "../generated/catalog.json";
import { WIDGETS } from "./widgets";

/** What kind of audio unit a component realizes into. */
export type ComponentKind = "faust" | "output" | "input" | "constant" | "widget";

export interface ComponentDef {
  /** Stable identifier used in serialized graphs, factory filenames, and by the AI. */
  id: string;
  title: string;
  category: string;
  kind: ComponentKind;
  /** One-line description shown in the node header's hover tooltip. */
  tooltip?: string;
  inputs: InputSpec[];
  outputs: OutputSpec[];
  /** Initial value for a Constant node. */
  value?: number;
  /** Faust source. Present for user-authored custom blocks (compiled at runtime);
   *  absent for built-in blocks (loaded from a precompiled factory by id). */
  code?: string;
  /** True for user-authored blocks in the custom-block registry. */
  custom?: boolean;
  /** For kind "widget": which React widget body renders this node. */
  widget?: string;
  /** Widget-specific config (LED colour, meter mode, sequencer step count…). */
  widgetConfig?: Record<string, unknown>;
  /** Widgets with a resize handle. */
  resizable?: boolean;
  /** Default widget body size in px. */
  defaultSize?: { w: number; h: number };
}

/**
 * Non-Faust nodes, defined in code. Everything else in the palette comes from the
 * generated catalog (src/generated/catalog.json), produced by scripts/build-catalog.mjs
 * — hundreds of precompiled Faust DSP blocks, loaded as WASM factories on demand.
 */
const SPECIAL: ComponentDef[] = [
  {
    id: "constant",
    title: "Constant",
    category: "Values",
    kind: "constant",
    tooltip: "Emits a fixed value. Wire it into a control input to set that parameter.",
    inputs: [],
    outputs: [{ label: "value", tooltip: "The constant value." }],
    value: 1,
  },
  {
    id: "output",
    title: "Stereo Output",
    category: "I/O",
    kind: "output",
    tooltip: "The speakers. Route your final signal here.",
    inputs: [
      { label: "L", tooltip: "Left channel to the speakers." },
      { label: "R", tooltip: "Right channel to the speakers." },
    ],
    outputs: [],
  },
  {
    id: "input",
    title: "Audio Input",
    category: "I/O",
    kind: "input",
    tooltip: "Microphone / line input (prompts for permission).",
    inputs: [],
    outputs: [
      { label: "L", tooltip: "Left channel from the input device." },
      { label: "R", tooltip: "Right channel from the input device." },
    ],
  },
];

export const LIBRARY: ComponentDef[] = [
  ...SPECIAL,
  ...WIDGETS,
  ...(generatedCatalog as ComponentDef[]),
];

export const LIBRARY_BY_ID = new Map(LIBRARY.map((c) => [c.id, c]));
