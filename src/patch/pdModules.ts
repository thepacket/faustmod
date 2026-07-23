import type { ComponentDef } from "../components/library";
import type { InputSpec, OutputSpec } from "../audio/types";

const STORAGE_KEY = "faustmod.pdModules";

/**
 * A Pd module: a loaded `.pd` file used as a single DSP node. Its ports come from the
 * patch's top-level `inlet~` / `outlet~` objects. We never edit Pd diagrams in
 * FaustMod — a module IS the loaded file (`code`). Persisted in localStorage.
 */
export interface PdModuleDef {
  id: string;
  title: string;
  code: string;
  inputs: InputSpec[];
  outputs: OutputSpec[];
}

/**
 * Split a `.pd` file into its records. Records are ';'-terminated; escaped semicolons
 * (`\;`, used inside message contents) are dropped first so they don't split records —
 * we only parse object definitions, which never contain them.
 */
function pdRecords(pd: string): string[] {
  return pd
    .replace(/\\;/g, " ")
    .split(";")
    .map((r) => r.replace(/\r?\n/g, " ").trim())
    .filter(Boolean);
}

/** Channel numbers an `adc~`/`dac~` reads; bare (no args) = channels 1 & 2. */
function channelsOf(args: string[]): number[] {
  const nums = args.map(Number).filter((n) => Number.isFinite(n) && n >= 1);
  return nums.length ? nums : [1, 2];
}

/**
 * Derive a Pd module's ports from its audio I/O objects. The WebPd engine drives a
 * patch's audio via `adc~` (input) / `dac~` (output) — not `inlet~`/`outlet~`. Input
 * ports = the audio channels the module reads (`adc~`, `adc~ 3`, …), one mono port per
 * channel, so a module can expose many inputs (audio + parameters, each on its own
 * channel). Output is stereo (WebPd caps output at 2 channels).
 */
export function parsePdPorts(pd: string): { inputs: InputSpec[]; outputs: OutputSpec[] } {
  let maxIn = 0;
  let maxOut = 0;
  // Optional metadata from Pd comments (Pd has no native audio port names/ranges):
  //   @in a b c   / @out l r        → port names
  //   @param <name> <default> <min> <max> → make that input a control input with range
  let inNames: string[] = [];
  let outNames: string[] = [];
  const params = new Map<string, { default: number; min: number; max: number }>();
  for (const rec of pdRecords(pd)) {
    const t = rec.split(/\s+/);
    if (t[0] === "#X" && t[1] === "obj") {
      if (t[4] === "adc~") maxIn = Math.max(maxIn, ...channelsOf(t.slice(5)));
      else if (t[4] === "dac~") maxOut = Math.max(maxOut, ...channelsOf(t.slice(5)));
    } else if (t[0] === "#X" && t[1] === "text") {
      const w = t.slice(4); // words after `#X text X Y`
      if (w[0] === "@in") inNames = w.slice(1);
      else if (w[0] === "@out") outNames = w.slice(1);
      else if (w[0] === "@param" && w.length >= 5) {
        params.set(w[1], { default: +w[2], min: +w[3], max: +w[4] });
      }
    }
  }
  maxOut = Math.min(maxOut, 2); // WebPd output is stereo

  const inputs: InputSpec[] = Array.from({ length: maxIn }, (_, i) => {
    const label = inNames[i] || `${i + 1}`;
    const p = params.get(label);
    return p ? { label, default: p.default, min: p.min, max: p.max } : { label };
  });
  const outputs: OutputSpec[] = Array.from({ length: maxOut }, (_, i) => ({
    label: outNames[i] || `${i + 1}`,
  }));
  return { inputs, outputs };
}

/** Palette/canvas view of a Pd module — it looks like any component node. */
export function toPdComponentDef(m: PdModuleDef): ComponentDef {
  return {
    id: m.id,
    title: m.title,
    category: "Pd",
    kind: "pd",
    tooltip: `Pd module (${m.inputs.length} in / ${m.outputs.length} out)`,
    code: m.code, // the .pd source, compiled by WebPd at realize time
    inputs: m.inputs,
    outputs: m.outputs,
  };
}

/** Registry of loaded Pd modules (localStorage-backed, observable). */
class PdModulesImpl {
  private map = new Map<string, PdModuleDef>();
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) for (const m of JSON.parse(raw) as PdModuleDef[]) this.map.set(m.id, m);
    } catch {
      /* ignore corrupt storage */
    }
  }

  all(): PdModuleDef[] {
    return [...this.map.values()];
  }
  get(id: string): PdModuleDef | undefined {
    return this.map.get(id);
  }
  def(id: string): ComponentDef | undefined {
    const m = this.map.get(id);
    return m ? toPdComponentDef(m) : undefined;
  }

  add(m: PdModuleDef) {
    this.map.set(m.id, m);
    this.persist();
    this.emit();
  }
  remove(id: string) {
    if (this.map.delete(id)) {
      this.persist();
      this.emit();
    }
  }
  rename(id: string, title: string) {
    const m = this.map.get(id);
    if (!m || !title.trim()) return;
    this.map.set(id, { ...m, title: title.trim() });
    this.persist();
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.all()));
    } catch {
      /* storage full / unavailable */
    }
  }
  private emit() {
    for (const l of this.listeners) l();
  }
}

export const PdModules = new PdModulesImpl();
