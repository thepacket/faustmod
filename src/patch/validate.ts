import { resolveComponent } from "../components/customBlocks";
import type { ComponentDef } from "../components/library";
import type { PatchFile } from "./format";

/**
 * Structural check of a patch document before it is opened in a tab. `parsePatch` only
 * proves the file is shaped like a patch; this proves it can actually be realised —
 * every componentId exists, node ids are unique, and every connection names a real port.
 *
 * Written for the AI Gen flow, where the model can invent a plausible-looking block id or
 * wire in-3 on a two-input node: the editor would silently drop those, leaving a patch
 * that looks right and makes no sound. Returning the problems as text lets the Fix button
 * hand them straight back to the model.
 */
/**
 * Check a node's adjusted input defaults ("params"). Two things can go wrong. A value
 * outside a control input's declared range doesn't fail to load, it drives the DSP
 * somewhere it can't go — a zero-delay-feedback filter handed a cutoff out of range
 * diverges to NaN and goes silent with no error anywhere. And params on a node whose unit
 * has no setParam are simply ignored, so the patch would sound wrong with no clue why.
 */
function paramIssues(
  nodeId: string,
  def: ComponentDef,
  params: Record<string, number> | undefined,
): string[] {
  if (!params) return [];
  const out: string[] = [];
  if (def.kind !== "faust" && def.kind !== "module") {
    return [
      `Node "${nodeId}" (${def.title}) sets params, but only Faust blocks hold their own input values — wire a signal in instead.`,
    ];
  }
  for (const [key, value] of Object.entries(params)) {
    const m = /^in-(\d+)$/.exec(key);
    if (!m) {
      out.push(`Node "${nodeId}" has params key "${key}" — expected in-N.`);
      continue;
    }
    const spec = def.inputs[Number(m[1])];
    if (!spec) {
      out.push(`Node "${nodeId}" sets params "${key}" but has only ${def.inputs.length} input(s).`);
    } else if (typeof value !== "number" || !Number.isFinite(value)) {
      out.push(`Node "${nodeId}" params "${key}" is not a number.`);
    } else if (
      (spec.min !== undefined && value < spec.min) ||
      (spec.max !== undefined && value > spec.max)
    ) {
      out.push(`Node "${nodeId}" params "${key}" ("${spec.label}") is ${value}, outside its ${spec.min}–${spec.max} range.`);
    }
  }
  return out;
}

export function validatePatch(patch: PatchFile): string[] {
  const issues: string[] = [];

  // The patch's own custom blocks count as defined even though they aren't registered yet.
  const embedded = new Map<string, ComponentDef>();
  for (const b of patch.customBlocks ?? []) {
    embedded.set(b.id, b as unknown as ComponentDef);
  }
  const defOf = (id: string) => embedded.get(id) ?? resolveComponent(id);

  const byId = new Map<string, ComponentDef>();
  const seen = new Set<string>();
  for (const n of patch.nodes) {
    if (seen.has(n.id)) issues.push(`Duplicate node id "${n.id}".`);
    seen.add(n.id);
    const def = defOf(n.componentId);
    if (!def) issues.push(`Node "${n.id}" uses unknown componentId "${n.componentId}".`);
    else {
      byId.set(n.id, def);
      issues.push(...paramIssues(n.id, def, n.params));
    }
  }

  // Port keys are positional: in-0..in-(N-1), out-0..out-(M-1) — see editor/DspNode.
  const port = (key: string, count: number, kind: "in" | "out") => {
    const m = new RegExp(`^${kind}-(\\d+)$`).exec(key);
    if (!m) return `expected ${kind}-N`;
    return Number(m[1]) < count ? null : `only has ${count} ${kind === "in" ? "input" : "output"}(s)`;
  };

  for (const c of patch.connections) {
    const src = byId.get(c.source);
    const dst = byId.get(c.target);
    if (!patch.nodes.some((n) => n.id === c.source)) {
      issues.push(`Connection "${c.id}" comes from unknown node "${c.source}".`);
    } else if (src) {
      const bad = port(c.sourceOutput, src.outputs.length, "out");
      if (bad) issues.push(`Connection "${c.id}": "${c.source}" ${bad} (got "${c.sourceOutput}").`);
    }
    if (!patch.nodes.some((n) => n.id === c.target)) {
      issues.push(`Connection "${c.id}" goes to unknown node "${c.target}".`);
    } else if (dst) {
      const bad = port(c.targetInput, dst.inputs.length, "in");
      if (bad) issues.push(`Connection "${c.id}": "${c.target}" ${bad} (got "${c.targetInput}").`);
    }
  }

  // A patch with nothing reaching the speakers is valid JSON and completely silent.
  const outputs = new Set(patch.nodes.filter((n) => n.componentId === "output").map((n) => n.id));
  if (outputs.size === 0) issues.push(`No "output" node — the patch can never be heard.`);
  else if (!patch.connections.some((c) => outputs.has(c.target))) {
    issues.push(`Nothing is connected to the "output" node — the patch would be silent.`);
  }

  return issues;
}
