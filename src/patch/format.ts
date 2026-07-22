import type { InputSpec, OutputSpec } from "../audio/types";

/** File identifiers for the patch format. Bump VERSION on breaking changes. */
export const PATCH_FORMAT = "faustmod-patch";
export const BLOCK_FORMAT = "faustmod-block";
export const PATCH_VERSION = 1;
export const PATCH_EXTENSION = ".faustmod";

/** A single node in a saved patch. `value` is only present for Constant nodes. */
export interface PatchNode {
  id: string;
  componentId: string;
  position: { x: number; y: number };
  /** User-renamed node title (absent = the component's default title). */
  label?: string;
  value?: number;
  /** Widget node size (resizable widgets). */
  size?: { w: number; h: number };
  /** Widget node state (e.g. sequencer notes). */
  state?: Record<string, unknown>;
}

export interface PatchConnection {
  id: string;
  source: string;
  sourceOutput: string;
  target: string;
  targetInput: string;
}

/**
 * A user-authored DSP block: Faust source plus the port metadata our control-input
 * model needs (labels + defaults). Embedded in patches so they stay self-contained,
 * and stored in the custom-block registry so they appear in the palette.
 */
export interface CustomBlockDef {
  id: string;
  title: string;
  category: string;
  inputs: InputSpec[];
  outputs: OutputSpec[];
  code: string;
}

/** The `.faustmod` patch file. */
export interface PatchFile {
  format: typeof PATCH_FORMAT;
  version: number;
  name: string;
  createdAt?: string;
  masterVolume?: number;
  /** Custom blocks referenced by this patch (built-in blocks are not embedded). */
  customBlocks: CustomBlockDef[];
  nodes: PatchNode[];
  connections: PatchConnection[];
}

/** The graph portion the editor round-trips (subset of PatchFile). */
export interface GraphSnapshot {
  nodes: PatchNode[];
  connections: PatchConnection[];
}

export function emptyPatch(name = "Untitled"): PatchFile {
  return {
    format: PATCH_FORMAT,
    version: PATCH_VERSION,
    name,
    createdAt: new Date().toISOString(),
    customBlocks: [],
    nodes: [],
    connections: [],
  };
}

export function serializePatch(patch: PatchFile): string {
  return JSON.stringify(patch, null, 2);
}

/** Parse + validate a `.faustmod` patch file. Throws on malformed input. */
export function parsePatch(text: string): PatchFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON.");
  }
  const p = data as Partial<PatchFile>;
  if (p?.format !== PATCH_FORMAT) {
    throw new Error(`Not a FaustMod patch (missing "format": "${PATCH_FORMAT}").`);
  }
  if (!Array.isArray(p.nodes) || !Array.isArray(p.connections)) {
    throw new Error("Patch is missing nodes/connections.");
  }
  return {
    format: PATCH_FORMAT,
    version: typeof p.version === "number" ? p.version : PATCH_VERSION,
    name: typeof p.name === "string" ? p.name : "Untitled",
    createdAt: p.createdAt,
    masterVolume: p.masterVolume,
    customBlocks: Array.isArray(p.customBlocks) ? p.customBlocks : [],
    nodes: p.nodes as PatchNode[],
    connections: p.connections as PatchConnection[],
  };
}

/** Parse a standalone custom-block definition (the "faustmod-block" paste format). */
export function parseBlock(text: string): CustomBlockDef {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON.");
  }
  const b = data as Partial<CustomBlockDef> & { format?: string };
  if (b?.format && b.format !== BLOCK_FORMAT) {
    throw new Error(`Expected "format": "${BLOCK_FORMAT}".`);
  }
  if (typeof b.code !== "string" || !b.code.trim()) {
    throw new Error("Block is missing Faust `code`.");
  }
  if (typeof b.title !== "string" || !b.title.trim()) {
    throw new Error("Block is missing a `title`.");
  }
  return {
    id: b.id && b.id.trim() ? b.id : slugify(b.title),
    title: b.title,
    category: b.category?.trim() || "Custom",
    inputs: Array.isArray(b.inputs) ? b.inputs : [],
    outputs: Array.isArray(b.outputs) && b.outputs.length ? b.outputs : [{ label: "out" }],
    code: b.code,
  };
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "block"
  );
}
