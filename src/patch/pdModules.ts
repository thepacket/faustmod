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

/**
 * Derive a Pd module's ports from its audio I/O objects. The WebPd engine exposes a
 * patch's audio I/O as a STEREO worklet via `adc~` (input) and `dac~` (output) — not
 * `inlet~`/`outlet~` — so a module presents 2 input ports if it uses `adc~` and 2
 * output ports if it uses `dac~`. (Arbitrary mono ports via inlet~/outlet~ return with
 * the libpd+ELSE engine.)
 */
export function parsePdPorts(pd: string): { inputs: InputSpec[]; outputs: OutputSpec[] } {
  let hasAdc = false;
  let hasDac = false;
  for (const rec of pdRecords(pd)) {
    const t = rec.split(/\s+/);
    if (t[0] === "#X" && t[1] === "obj") {
      if (t[4] === "adc~") hasAdc = true;
      else if (t[4] === "dac~") hasDac = true;
    }
  }
  const stereo = (base: string) => [{ label: `${base} L` }, { label: `${base} R` }];
  return {
    inputs: hasAdc ? stereo("in") : [],
    outputs: hasDac ? stereo("out") : [],
  };
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
