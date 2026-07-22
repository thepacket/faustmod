import type { InputSpec, OutputSpec } from "./types";

/**
 * Derive FaustMod port specs from a compiled Faust program's JSON metadata
 * (`generator.getJSON()`). Audio channels become signal ports; UI params
 * (sliders/nentry/buttons) become control inputs — mirroring scripts/build-examples.mjs
 * so an edited module gets the same port layout it would have had at build time.
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

/** Parse `generator.getJSON()` into FaustMod input/output port specs. */
export function derivePorts(generatorJson: string): DerivedPorts {
  const meta = JSON.parse(generatorJson) as { inputs?: number; outputs?: number; ui?: UiItem[] };
  return {
    inputs: [...audioInputs(meta.inputs ?? 0), ...flattenParams(meta.ui)],
    outputs: audioOutputs(meta.outputs ?? 0),
  };
}
