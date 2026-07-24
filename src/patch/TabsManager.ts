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
  /** Saved-patch library id this tab is backed by (for rename sync + autosave). */
  savedId?: string;
}

let counter = 0;
const newId = () => `tab-${++counter}`;

/**
 * Manages multiple open patches as tabs over a single editor. The active tab's graph
 * lives in the editor (and drives audio); inactive tabs keep a serialized snapshot.
 * Switching captures the active graph, stops audio, then loads the target.
 */
export class TabsManager {
  // No tab exists until the user opens a patch from the library (New / Load / double-
  // click). Patches are not files, so the app doesn't auto-create a scratch tab.
  private tabs: Tab[] = [];
  private active = -1;
  onChange: (() => void) | null = null;
  /** Called just before the active tab is left (switch/close/new) — lets App flush a
   *  pending autosave of the active tab before its editor state is replaced/discarded. */
  onBeforeLeaveTab: (() => void) | null = null;

  constructor(private pm: PatchManager) {}

  /** Startup: no tab open → a blank canvas until the user opens a patch. */
  async init(): Promise<void> {
    await this.loadEmpty();
    this.onChange?.();
  }

  /** Blank the editor (no tab open): stop audio and clear the graph. */
  private async loadEmpty(): Promise<void> {
    await AudioGraph.stop();
    await this.pm.applyPatchObject({ ...emptyPatch(), nodes: [], connections: [] });
    this.pm.setIdentity({ name: "Untitled", handle: null, dirty: false });
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
    this.onBeforeLeaveTab?.(); // flush the active tab's pending autosave first
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

  /**
   * Open an in-memory patch into a new tab. If it's already open (same savedId), just
   * switch to it. `savedId` links the tab to a Saved Patches library entry.
   */
  async openPatch(patch: PatchFile, savedId?: string): Promise<void> {
    if (savedId) {
      const existing = this.tabs.findIndex((t) => t.savedId === savedId);
      if (existing >= 0) {
        await this.switchTo(existing);
        return;
      }
    }
    this.captureActive();
    const t: Tab = {
      id: newId(),
      name: patch.name || "Untitled",
      dirty: false,
      handle: null,
      patch,
      savedId,
    };
    this.tabs.push(t);
    this.active = this.tabs.length - 1;
    await this.load(t);
    this.onChange?.();
  }

  /** The saved-patch id backing the active tab, if any (for autosave). */
  activeSavedId(): string | undefined {
    return this.tabs[this.active]?.savedId;
  }

  /** Rename any open tab(s) backed by a saved-patch id (palette rename → tab title). */
  renameSaved(savedId: string, name: string): void {
    let changed = false;
    for (const t of this.tabs) {
      if (t.savedId === savedId && t.name !== name) {
        t.name = name;
        changed = true;
      }
    }
    if (changed) {
      // Keep the active tab's PatchManager identity in sync too.
      if (this.tabs[this.active]?.savedId === savedId) {
        const cur = this.pm.getIdentity();
        this.pm.setIdentity({ ...cur, name });
      }
      this.onChange?.();
    }
  }

  async closeTab(index: number): Promise<void> {
    const t = this.tabs[index];
    if (!t) return;
    // Persist the active tab's latest edits to the library BEFORE any close logic.
    if (index === this.active) this.onBeforeLeaveTab?.();
    // A library-backed patch (savedId) is stored transparently — closing loses nothing,
    // so never prompt. Only warn for a tab that isn't in the library (e.g. an untitled
    // scratch tab or an opened preset) and has unsaved edits.
    if (!t.savedId && t.dirty && !window.confirm(`Close "${t.name}" with unsaved changes?`)) return;

    const wasActive = index === this.active;
    this.tabs.splice(index, 1);

    // Closing the last tab leaves NO tab open — a blank canvas, not a fresh scratch tab.
    if (this.tabs.length === 0) {
      this.active = -1;
      await this.loadEmpty();
      this.onChange?.();
      return;
    }

    if (this.active > index) this.active--;
    if (this.active >= this.tabs.length) this.active = this.tabs.length - 1;
    if (wasActive) await this.load(this.tabs[this.active]);
    this.onChange?.();
  }
}
