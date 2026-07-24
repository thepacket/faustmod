import type { PatchFile } from "./format";
import type { ComponentDef } from "../components/library";
import { derivePatchSignature, type PatchSignature } from "./signature";

const STORAGE_KEY = "faustmod.savedPatches";
const LEGACY_EMBEDDABLE_KEY = "faustmod.embeddablePatches";

/**
 * A saved patch document. It opens into a tab; if it contains I/O terminals it is ALSO
 * embeddable — draggable onto a canvas as a single node whose ports are those terminals
 * (see derivePatchSignature). There is ONE store: embeddability is derived, not a separate
 * list. Persisted in localStorage.
 */
export interface SavedPatchDef {
  id: string;
  name: string;
  patch: PatchFile;
}

/** Registry of saved patches (localStorage-backed, observable). */
class SavedPatchesImpl {
  private map = new Map<string, SavedPatchDef>();
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        for (const p of JSON.parse(raw) as SavedPatchDef[]) this.map.set(p.id, p);
      }
      this.migrateLegacyEmbeddable();
    } catch {
      /* ignore corrupt storage */
    }
  }

  // Fold any pre-merge "embeddable patches" store into this one (one-time).
  private migrateLegacyEmbeddable() {
    try {
      const raw = localStorage.getItem(LEGACY_EMBEDDABLE_KEY);
      if (!raw) return;
      for (const e of JSON.parse(raw) as { id: string; title: string; patch: PatchFile }[]) {
        if (!this.map.has(e.id)) this.map.set(e.id, { id: e.id, name: e.title, patch: e.patch });
      }
      localStorage.removeItem(LEGACY_EMBEDDABLE_KEY);
      this.persist();
    } catch {
      /* ignore */
    }
  }

  all(): SavedPatchDef[] {
    return [...this.map.values()];
  }
  get(id: string): SavedPatchDef | undefined {
    return this.map.get(id);
  }

  /** The external port signature from the patch's I/O terminals (empty if none). */
  signature(id: string): PatchSignature | null {
    const p = this.map.get(id);
    return p ? derivePatchSignature(p.patch.nodes) : null;
  }

  /** A patch is embeddable when it declares at least one In or Out terminal. */
  isEmbeddable(id: string): boolean {
    const sig = this.signature(id);
    return !!sig && (sig.inputs.length > 0 || sig.outputs.length > 0);
  }

  /** ComponentDef for the palette/canvas — only for embeddable patches; else undefined. */
  def(id: string): ComponentDef | undefined {
    const p = this.map.get(id);
    if (!p) return undefined;
    const sig = derivePatchSignature(p.patch.nodes);
    if (sig.inputs.length === 0 && sig.outputs.length === 0) return undefined;
    return {
      id: p.id,
      title: p.name,
      category: "Patches",
      kind: "patch",
      tooltip: `Embedded patch: ${sig.inputs.length} in / ${sig.outputs.length} out`,
      inputs: sig.inputs,
      outputs: sig.outputs,
    };
  }

  add(p: SavedPatchDef) {
    this.map.set(p.id, p);
    this.persist();
    this.emit();
  }
  /** Replace a patch's graph (autosave from its open tab), keeping id + name. */
  update(id: string, patch: PatchFile) {
    const p = this.map.get(id);
    if (!p) return;
    this.map.set(id, { ...p, patch: { ...patch, name: p.name } });
    this.persist();
    this.emit();
  }
  remove(id: string) {
    if (this.map.delete(id)) {
      this.persist();
      this.emit();
    }
  }
  /** Rename, updating both the library entry and the patch's own name. */
  rename(id: string, name: string) {
    const p = this.map.get(id);
    if (!p || !name.trim()) return;
    const trimmed = name.trim();
    this.map.set(id, { ...p, name: trimmed, patch: { ...p.patch, name: trimmed } });
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

export const SavedPatches = new SavedPatchesImpl();
