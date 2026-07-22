import { AudioGraph } from "../audio/AudioGraph";
import type { PatchManager } from "./PatchManager";
import { emptyPatch, type PatchFile } from "./format";

export interface TabInfo {
  id: string;
  name: string;
  dirty: boolean;
}

interface Tab {
  id: string;
  name: string;
  dirty: boolean;
  handle: unknown;
  /** Serialized graph — the source of truth for INACTIVE tabs. */
  patch: PatchFile;
}

let counter = 0;
const newId = () => `tab-${++counter}`;

/**
 * Manages multiple open patches as tabs over a single editor. The active tab's graph
 * lives in the editor (and drives audio); inactive tabs keep a serialized snapshot.
 * Switching captures the active graph, stops audio, then loads the target.
 */
export class TabsManager {
  private tabs: Tab[];
  private active = 0;
  onChange: (() => void) | null = null;

  constructor(private pm: PatchManager) {
    this.tabs = [
      { id: newId(), name: "Untitled", dirty: false, handle: null, patch: emptyPatch() },
    ];
  }

  /** Load the initial tab into the editor (starter nodes on a fresh patch). */
  async init(): Promise<void> {
    await this.load(this.tabs[this.active]);
    this.onChange?.();
  }

  list(): TabInfo[] {
    return this.tabs.map((t) => ({ id: t.id, name: t.name, dirty: t.dirty }));
  }
  activeIndex(): number {
    return this.active;
  }

  /** Reflect the PatchManager's current identity into the active tab (on pm change). */
  syncActive(): void {
    const t = this.tabs[this.active];
    if (t) {
      const id = this.pm.getIdentity();
      t.name = id.name;
      t.dirty = id.dirty;
      t.handle = id.handle;
    }
    this.onChange?.();
  }

  private captureActive(): void {
    const t = this.tabs[this.active];
    if (!t) return;
    t.patch = this.pm.build();
    const id = this.pm.getIdentity();
    t.name = id.name;
    t.dirty = id.dirty;
    t.handle = id.handle;
  }

  private async load(t: Tab): Promise<void> {
    await AudioGraph.stop();
    await this.pm.applyPatchObject(t.patch);
    // applyPatchObject rebuilds the graph (which flags dirty); restore stored identity.
    this.pm.setIdentity({ name: t.name, handle: t.handle, dirty: t.dirty });
  }

  async switchTo(index: number): Promise<void> {
    if (index === this.active || index < 0 || index >= this.tabs.length) return;
    this.captureActive();
    this.active = index;
    await this.load(this.tabs[index]);
    this.onChange?.();
  }

  async newTab(): Promise<void> {
    this.captureActive();
    const t: Tab = {
      id: newId(),
      name: "Untitled",
      dirty: false,
      handle: null,
      patch: emptyPatch(),
    };
    this.tabs.push(t);
    this.active = this.tabs.length - 1;
    await this.load(t);
    this.onChange?.();
  }

  /** Open a file into a new tab. */
  async openFile(): Promise<void> {
    await this.newTab();
    await this.pm.open(); // updates identity (name/handle) → syncActive refreshes the tab
  }

  /** Open an in-memory patch (e.g. a bundled preset) into a new tab. */
  async openPatch(patch: PatchFile): Promise<void> {
    this.captureActive();
    const t: Tab = {
      id: newId(),
      name: patch.name || "Untitled",
      dirty: false,
      handle: null,
      patch,
    };
    this.tabs.push(t);
    this.active = this.tabs.length - 1;
    await this.load(t);
    this.onChange?.();
  }

  async closeTab(index: number): Promise<void> {
    const t = this.tabs[index];
    if (!t) return;
    if (t.dirty && !window.confirm(`Close "${t.name}" with unsaved changes?`)) return;

    if (this.tabs.length === 1) {
      const fresh: Tab = {
        id: newId(),
        name: "Untitled",
        dirty: false,
        handle: null,
        patch: emptyPatch(),
      };
      this.tabs = [fresh];
      this.active = 0;
      await this.load(fresh);
      this.onChange?.();
      return;
    }

    const wasActive = index === this.active;
    this.tabs.splice(index, 1);
    if (this.active > index) this.active--;
    if (this.active >= this.tabs.length) this.active = this.tabs.length - 1;
    if (wasActive) await this.load(this.tabs[this.active]);
    this.onChange?.();
  }
}
