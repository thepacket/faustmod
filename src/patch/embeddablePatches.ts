import type { PatchFile } from "./format";
import type { ComponentDef } from "../components/library";
import type { InputSpec, OutputSpec } from "../audio/types";

const STORAGE_KEY = "faustmod.embeddablePatches";

/**
 * A patch registered so it can be dropped into another patch as a single node. Carries
 * the full subgraph (`patch`) plus the external port signature derived from its I/O
 * terminals (see derivePatchSignature). Persisted in localStorage.
 */
export interface EmbeddablePatchDef {
  id: string;
  title: string;
  patch: PatchFile;
  inputs: InputSpec[];
  outputs: OutputSpec[];
}

/** The palette/canvas view of an embeddable patch — it looks like any component node. */
export function toPatchComponentDef(p: EmbeddablePatchDef): ComponentDef {
  return {
    id: p.id,
    title: p.title,
    category: "Patches",
    kind: "patch",
    tooltip: `Embedded patch: ${p.inputs.length} in / ${p.outputs.length} out`,
    inputs: p.inputs,
    outputs: p.outputs,
  };
}

/** Registry of embeddable patches (localStorage-backed, observable). */
class EmbeddablePatchesImpl {
  private map = new Map<string, EmbeddablePatchDef>();
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        for (const p of JSON.parse(raw) as EmbeddablePatchDef[]) this.map.set(p.id, p);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  all(): EmbeddablePatchDef[] {
    return [...this.map.values()];
  }
  get(id: string): EmbeddablePatchDef | undefined {
    return this.map.get(id);
  }
  /** Resolve to a ComponentDef (for the palette / resolveComponent), or undefined. */
  def(id: string): ComponentDef | undefined {
    const p = this.map.get(id);
    return p ? toPatchComponentDef(p) : undefined;
  }

  add(p: EmbeddablePatchDef) {
    this.map.set(p.id, p);
    this.persist();
    this.emit();
  }
  remove(id: string) {
    if (this.map.delete(id)) {
      this.persist();
      this.emit();
    }
  }
  /** Rename, keeping the id so already-placed nodes still resolve. */
  rename(id: string, title: string) {
    const p = this.map.get(id);
    if (!p || !title.trim()) return;
    this.map.set(id, { ...p, title: title.trim() });
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

export const EmbeddablePatches = new EmbeddablePatchesImpl();

export type { InputSpec, OutputSpec };
