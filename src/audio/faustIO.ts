import type { InputSpec, OutputSpec } from "./types";

/**
 * Derive FaustMod port specs from a compiled Faust program's JSON metadata
 * (`generator.getJSON()`). Audio channels become signal ports; UI params
 * (sliders/nentry/buttons) become control inputs. This is the single source of truth
 * for how a user-defined DSP's Faust code maps to node connectors.
 */

const num = (v: unknown): number => (typeof v === "number" ? v : parseFloat(String(v)));
const unitOf = (it: UiItem): string | undefined =>
  it.meta?.find((m) => "unit" in m)?.unit as string | undefined;

interface UiItem {
  type?: string;
  label?: string;
  address?: string;
  init?: number | string;
  min?: number | string;
  max?: number | string;
  items?: UiItem[];
  meta?: Record<string, unknown>[];
}

function flattenParams(items: UiItem[] | undefined, out: InputSpec[] = []): InputSpec[] {
  for (const it of items ?? []) {
    if (it.items) {
      flattenParams(it.items, out);
      continue;
    }
    const t = it.type;
    if (t === "hslider" || t === "vslider" || t === "nentry") {
      out.push({
        label: it.label ?? "",
        paramPath: it.address,
        default: num(it.init),
        min: num(it.min),
        max: num(it.max),
        unit: unitOf(it),
      });
    } else if (t === "button" || t === "checkbox") {
      out.push({
        label: it.label ?? "",
        paramPath: it.address,
        default: num(it.init) || 0,
        min: 0,
        max: 1,
      });
    }
  }
  return out;
}

function audioInputs(n: number): InputSpec[] {
  if (n === 1) return [{ label: "in" }];
  if (n === 2) return [{ label: "L" }, { label: "R" }];
  return Array.from({ length: n }, (_, i) => ({ label: `in ${i}` }));
}

function audioOutputs(n: number): OutputSpec[] {
  if (n === 1) return [{ label: "out" }];
  if (n === 2) return [{ label: "L" }, { label: "R" }];
  return Array.from({ length: n }, (_, i) => ({ label: `out ${i}` }));
}

export interface DerivedPorts {
  inputs: InputSpec[];
  outputs: OutputSpec[];
}

/** Parse the `process(a, b, …)` argument names from Faust source (simple identifiers only). */
function processArgNames(code?: string): string[] | null {
  if (!code) return null;
  const m = code.match(/\bprocess\s*\(([^)]*)\)\s*=/);
  if (!m) return null;
  const args = m[1].split(",").map((s) => s.trim());
  if (!args.length || args.some((a) => !/^[a-zA-Z_]\w*$/.test(a))) return null;
  return args;
}

/**
 * Parse `generator.getJSON()` into FaustMod input/output port specs. When the Faust
 * `code` is supplied and its `process(…)` signature is plain identifiers, those names
 * label the audio inputs (so `process(a, b)` gives ports `a`, `b`); otherwise the
 * generic L/R / in-N labels are used.
 */
export function derivePorts(generatorJson: string, code?: string): DerivedPorts {
  const meta = JSON.parse(generatorJson) as { inputs?: number; outputs?: number; ui?: UiItem[] };
  const nAudio = meta.inputs ?? 0;
  const argNames = processArgNames(code);
  const audioIn =
    argNames && argNames.length === nAudio
      ? argNames.map((label) => ({ label }))
      : audioInputs(nAudio);
  return {
    inputs: [...audioIn, ...flattenParams(meta.ui)],
    outputs: audioOutputs(meta.outputs ?? 0),
  };
}
