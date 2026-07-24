import type { EditorHandle } from "../editor/createEditor";
import { AudioEngine } from "../audio/AudioEngine";
import { CustomBlocks } from "../components/customBlocks";
import {
  type PatchFile,
  type CustomBlockDef,
  PATCH_FORMAT,
  PATCH_VERSION,
  PATCH_EXTENSION,
  serializePatch,
  parsePatch,
} from "./format";

/** Feature-detect the File System Access API (Chromium). Falls back to download/upload. */
const hasFSA =
  typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker ===
  "function";

// Minimal structural types for the File System Access API (not in the default TS lib).
interface FsWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}
interface FsFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
}
type WinFS = {
  showSaveFilePicker(opts: unknown): Promise<FsFileHandle>;
  showOpenFilePicker(opts: unknown): Promise<FsFileHandle[]>;
};

/**
 * Owns the current patch's file identity (name, handle, dirty state) and drives
 * new / open / save / save-as / export against the editor. Patches are self-contained:
 * any custom blocks a patch references are embedded on save and re-registered on open.
 */
export class PatchManager {
  name = "Untitled";
  dirty = false;
  onChange: (() => void) | null = null;
  private handle: FsFileHandle | null = null;

  constructor(private editor: EditorHandle) {}

  private notify() {
    this.onChange?.();
  }

  markDirty() {
    if (!this.dirty) {
      this.dirty = true;
      this.notify();
    }
  }

  /** Build a PatchFile from the current editor graph, embedding used custom blocks. */
  build(): PatchFile {
    const snap = this.editor.snapshot();
    const usedIds = new Set(snap.nodes.map((n) => n.componentId));
    const customBlocks: CustomBlockDef[] = [];
    for (const id of usedIds) {
      const block = CustomBlocks.toDef(id);
      if (block) customBlocks.push(block);
    }
    return {
      format: PATCH_FORMAT,
      version: PATCH_VERSION,
      name: this.name,
      createdAt: new Date().toISOString(),
      masterVolume: AudioEngine.masterVolume,
      customBlocks,
      nodes: snap.nodes,
      connections: snap.connections,
    };
  }

  async newPatch(): Promise<void> {
    if (!this.confirmDiscard()) return;
    await this.editor.clear();
    this.name = "Untitled";
    this.handle = null;
    this.dirty = false;
    this.notify();
  }

  // ---- Tab support: the identity (name/handle/dirty) belongs to the active tab.
  getIdentity(): { name: string; handle: unknown; dirty: boolean } {
    return { name: this.name, handle: this.handle, dirty: this.dirty };
  }
  setIdentity(id: { name: string; handle: unknown; dirty: boolean }): void {
    this.name = id.name;
    this.handle = (id.handle as FsFileHandle | null) ?? null;
    this.dirty = id.dirty;
    this.notify();
  }
  /** Load a patch object (no file picker); registers embedded custom blocks. */
  async applyPatchObject(patch: PatchFile): Promise<void> {
    await this.applyPatch(patch);
  }

  async save(): Promise<void> {
    if (this.handle && hasFSA) {
      await this.writeHandle(this.handle);
      this.dirty = false;
      this.notify();
    } else {
      await this.saveAs();
    }
  }

  async saveAs(): Promise<void> {
    const filename = `${sanitize(this.name)}${PATCH_EXTENSION}`;
    if (hasFSA) {
      let handle: FsFileHandle;
      try {
        handle = await (window as unknown as WinFS).showSaveFilePicker({
          suggestedName: filename,
          types: [fileType()],
        });
      } catch (e) {
        if (isAbort(e)) return;
        throw e;
      }
      await this.writeHandle(handle);
      this.handle = handle;
      this.name = stripExt(handle.name);
      this.dirty = false;
      this.notify();
    } else {
      download(filename, serializePatch(this.build()));
      this.dirty = false;
      this.notify();
    }
  }

  /** Download a copy without changing the current file identity. */
  export(): void {
    download(`${sanitize(this.name)}${PATCH_EXTENSION}`, serializePatch(this.build()));
  }

  async open(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const picked = await this.pickFile();
    if (!picked) return;
    const patch = parsePatch(picked.text);
    await this.applyPatch(patch);
    this.handle = picked.handle ?? null;
    this.name = patch.name || stripExt(picked.name);
    this.dirty = false;
    this.notify();
  }

  private async applyPatch(patch: PatchFile): Promise<void> {
    for (const block of patch.customBlocks) CustomBlocks.add(block);
    // Set the name BEFORE rebuilding: editor.load fires change events that sync the active
    // tab's title from this.name, so a stale name (e.g. "Untitled" from the empty state)
    // would otherwise be stamped onto the tab on the first open.
    this.name = patch.name || "Untitled";
    await this.editor.load({ nodes: patch.nodes, connections: patch.connections });
    if (typeof patch.masterVolume === "number") {
      AudioEngine.setMasterVolume(patch.masterVolume);
    }
  }

  private async writeHandle(handle: FsFileHandle): Promise<void> {
    const w = await handle.createWritable();
    await w.write(serializePatch(this.build()));
    await w.close();
  }

  private async pickFile(): Promise<{ name: string; text: string; handle?: FsFileHandle } | null> {
    if (hasFSA) {
      try {
        const [handle] = await (window as unknown as WinFS).showOpenFilePicker({
          types: [fileType()],
          multiple: false,
        });
        const file = await handle.getFile();
        return { name: file.name, text: await file.text(), handle };
      } catch (e) {
        if (isAbort(e)) return null;
        throw e;
      }
    }
    return pickViaInput();
  }

  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm("Discard unsaved changes to this patch?");
  }
}

function fileType() {
  return {
    description: "FaustMod patch",
    accept: { "application/json": [PATCH_EXTENSION, ".json"] },
  };
}

function sanitize(name: string): string {
  return name.replace(/[^\w.-]+/g, "-").replace(/(^-|-$)/g, "") || "patch";
}

function stripExt(name: string): string {
  return name.replace(/\.faustmod$/i, "").replace(/\.json$/i, "");
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickViaInput(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${PATCH_EXTENSION},.json,application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      resolve({ name: file.name, text: await file.text() });
    };
    input.click();
  });
}
