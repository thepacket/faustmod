import type { PatchNode } from "./format";
import type { InputSpec, OutputSpec } from "../audio/types";

/** Component ids of the patch I/O terminals (see library.ts). */
export const TERMINAL_IN = "terminal-in";
export const TERMINAL_OUT = "terminal-out";

/**
 * The external port signature a patch presents when embedded in another patch. Input
 * terminals become input ports, output terminals become output ports. `inputTerminals`
 * / `outputTerminals` hold the terminal node ids aligned index-for-index with the
 * ports, so the embedding logic knows which boundary node each parent connection maps
 * to.
 */
export interface PatchSignature {
  inputs: InputSpec[];
  outputs: OutputSpec[];
  inputTerminals: string[];
  outputTerminals: string[];
}

/** A terminal's port name: its user label, else a sensible default. */
function portName(n: PatchNode, fallback: string): string {
  return n.label?.trim() || fallback;
}

/**
 * Ensure port labels are unique for display by suffixing repeats (" 2", " 3", …).
 * Ports stay keyed by index in the node model, so this only affects what's shown.
 */
function dedupe(labels: string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((label) => {
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return count === 1 ? label : `${label} ${count}`;
  });
}

/**
 * Derive a patch's external port signature from its terminal nodes. Ports are ordered
 * top-to-bottom by the terminals' vertical position (x as a tie-breaker), so the visual
 * layout determines port order.
 */
export function derivePatchSignature(nodes: PatchNode[]): PatchSignature {
  const byPosition = (a: PatchNode, b: PatchNode) =>
    a.position.y - b.position.y || a.position.x - b.position.x;

  const ins = nodes.filter((n) => n.componentId === TERMINAL_IN).sort(byPosition);
  const outs = nodes.filter((n) => n.componentId === TERMINAL_OUT).sort(byPosition);

  const inLabels = dedupe(ins.map((n) => portName(n, "in")));
  const outLabels = dedupe(outs.map((n) => portName(n, "out")));

  return {
    inputs: inLabels.map((label) => ({ label })),
    outputs: outLabels.map((label) => ({ label })),
    inputTerminals: ins.map((n) => n.id),
    outputTerminals: outs.map((n) => n.id),
  };
}
