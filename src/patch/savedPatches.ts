import type { PatchFile } from "./format";

const STORAGE_KEY = "faustmod.savedPatches";

/**
 * A full (non-embedded) patch document kept in a user library so it survives closing its
 * tab. Unlike an EmbeddablePatch (which becomes a node), a SavedPatch opens into its own
 * tab. Persisted in localStorage.
 */
export interface SavedPatchDef {
  id: string;
  name: string;
  patch: PatchFile;
}

/** Registry of saved full patches (localStorage-backed, observable). */
class SavedPatchesImpl {
  private map = new Map<string, SavedPatchDef>();
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        for (const p of JSON.parse(raw) as SavedPatchDef[]) this.map.set(p.id, p);
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  all(): SavedPatchDef[] {
    return [...this.map.values()];
  }
  get(id: string): SavedPatchDef | undefined {
    return this.map.get(id);
  }

  add(p: SavedPatchDef) {
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
