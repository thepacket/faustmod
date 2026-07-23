import { LIBRARY_BY_ID, type ComponentDef } from "./library";
import { MODULES_BY_ID } from "./modules";
import { EmbeddablePatches } from "../patch/embeddablePatches";
import { PdModules } from "../patch/pdModules";
import type { CustomBlockDef } from "../patch/format";

const STORAGE_KEY = "faustmod.customBlocks";

function toComponentDef(b: CustomBlockDef): ComponentDef {
  return {
    id: b.id,
    title: b.title,
    category: b.category || "Custom",
    kind: "faust",
    custom: true,
    code: b.code,
    inputs: b.inputs,
    outputs: b.outputs,
    dirty: b.dirty,
  };
}

function toBlockDef(d: ComponentDef): CustomBlockDef {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    inputs: d.inputs,
    outputs: d.outputs,
    code: d.code!,
    dirty: d.dirty,
  };
}

/**
 * Registry of user-authored DSP blocks. Persisted in localStorage so blocks the
 * user creates (or that arrive embedded in an opened patch) stay available in the
 * palette and can be realized at runtime via libfaust.
 */
class CustomBlocksImpl {
  private map = new Map<string, ComponentDef>();
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        for (const b of JSON.parse(raw) as CustomBlockDef[]) {
          this.map.set(b.id, toComponentDef(b));
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  all(): ComponentDef[] {
    return [...this.map.values()];
  }
  get(id: string): ComponentDef | undefined {
    return this.map.get(id);
  }
  has(id: string): boolean {
    return this.map.has(id);
  }
  toDef(id: string): CustomBlockDef | undefined {
    const d = this.map.get(id);
    return d?.code ? toBlockDef(d) : undefined;
  }

  add(block: CustomBlockDef) {
    this.map.set(block.id, toComponentDef(block));
    this.persist();
    this.emit();
  }
  remove(id: string) {
    if (this.map.delete(id)) {
      this.persist();
      this.emit();
    }
  }

  /** Rename a block, keeping its id (so placed nodes still resolve). */
  rename(id: string, title: string) {
    const d = this.map.get(id);
    if (!d || !title.trim()) return;
    this.map.set(id, { ...d, title: title.trim() });
    this.persist();
    this.emit();
  }

  /** Save edited source WITHOUT compiling: keeps existing ports, marks it dirty. */
  saveDraft(id: string, code: string) {
    const d = this.map.get(id);
    if (!d) return;
    this.map.set(id, { ...d, code, dirty: true });
    this.persist();
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    try {
      const arr = this.all().map(toBlockDef);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {
      /* storage full / unavailable */
    }
  }
  private emit() {
    for (const l of this.listeners) l();
  }
}

export const CustomBlocks = new CustomBlocksImpl();

/** Resolve a component id: built-in library, example modules, custom blocks, patches. */
export function resolveComponent(id: string): ComponentDef | undefined {
  return (
    LIBRARY_BY_ID.get(id) ??
    MODULES_BY_ID.get(id) ??
    CustomBlocks.get(id) ??
    EmbeddablePatches.def(id) ??
    PdModules.def(id)
  );
}
