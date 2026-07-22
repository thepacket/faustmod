import { parsePatch, type PatchFile } from "./format";

/**
 * Bundled example patches. Every `.faustmod` in the repo's /presets directory is
 * inlined at build time (raw text) so presets ship with the app and load offline.
 * These are hand-authored, musically-verified patches (see presets/README notes).
 */
const files = import.meta.glob("/presets/*.faustmod", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export interface Preset {
  name: string;
  file: string;
  patch: PatchFile;
}

export const PRESETS: Preset[] = Object.entries(files)
  .map(([path, text]): Preset | null => {
    try {
      const patch = parsePatch(text);
      return { name: patch.name, file: path.split("/").pop() ?? path, patch };
    } catch {
      return null;
    }
  })
  .filter((p): p is Preset => p !== null)
  .sort((a, b) => a.name.localeCompare(b.name));
