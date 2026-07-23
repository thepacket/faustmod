import type { InputSpec, OutputSpec } from "../audio/types";
import generatedCatalog from "../generated/catalog.json";
import { WIDGETS } from "./widgets";

/** DataTransfer MIME type carrying a component id when dragging from a palette. */
export const COMPONENT_DND_TYPE = "application/x-faustmod-component";

/** What kind of audio unit a component realizes into. */
export type ComponentKind =
  | "faust"
  | "output"
  | "input"
  | "constant"
  | "widget"
  | "module"
  | "terminal-in"
  | "terminal-out"
  | "patch";

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
  /** User module saved but not yet successfully compiled (draft). */
  dirty?: boolean;
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
  {
    id: "terminal-in",
    title: "In",
    category: "I/O",
    kind: "terminal-in",
    tooltip:
      "Patch input terminal. When this patch is embedded in another, this becomes an INPUT port on the embedded node — rename it to name the port. Inert at the top level.",
    inputs: [],
    outputs: [{ label: "", tooltip: "Signal entering the patch from the parent." }],
  },
  {
    id: "terminal-out",
    title: "Out",
    category: "I/O",
    kind: "terminal-out",
    tooltip:
      "Patch output terminal. When this patch is embedded in another, this becomes an OUTPUT port on the embedded node — rename it to name the port. A sink at the top level.",
    inputs: [{ label: "", tooltip: "Signal leaving the patch to the parent." }],
    outputs: [],
  },
];

export const LIBRARY: ComponentDef[] = [
  ...SPECIAL,
  ...WIDGETS,
  ...(generatedCatalog as ComponentDef[]),
];

export const LIBRARY_BY_ID = new Map(LIBRARY.map((c) => [c.id, c]));
