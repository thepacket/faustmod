import { CustomBlocks } from "../components/customBlocks";
import { PdModules } from "./pdModules";
import { SavedPatches } from "./savedPatches";
import { OPENROUTER_SYSTEM, OPENROUTER_PD_SYSTEM, OPENROUTER_MODEL } from "../ai/openrouter";

/**
 * Portable backup of ALL of a user's localStorage-bound work, so it can be carried
 * between machines/browsers (localStorage never leaves the device it was made on). One
 * JSON file holds every Faust module, Pd module, embeddable patch and saved patch, plus
 * the portable settings. The OpenRouter API KEY is deliberately excluded — a secret must
 * not land in a plaintext export.
 */
const BACKUP_FORMAT = "faustmod-backup";
const BACKUP_VERSION = 1;

// Portable (non-secret, non-device) settings worth carrying between machines.
const SETTING_KEYS = [OPENROUTER_SYSTEM, OPENROUTER_PD_SYSTEM, OPENROUTER_MODEL];

export interface ImportResult {
  modules: number;
  pdModules: number;
  saved: number;
  settings: number;
}

/** Serialize everything into a single backup JSON string. */
export function buildBackup(): string {
  const settings: Record<string, string> = {};
  for (const k of SETTING_KEYS) {
    const v = localStorage.getItem(k);
    if (v != null) settings[k] = v;
  }
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      // Faust modules must be exported in their stored (CustomBlockDef) shape.
      customBlocks: CustomBlocks.all()
        .map((d) => CustomBlocks.toDef(d.id))
        .filter((b): b is NonNullable<typeof b> => !!b),
      pdModules: PdModules.all(),
      savedPatches: SavedPatches.all(),
      settings,
    },
    null,
    2,
  );
}

/**
 * Merge a backup file into the current stores (add/overwrite by id — existing local items
 * not present in the file are kept). Throws on a non-backup file. Each store's add()
 * persists + notifies, so the palette refreshes live.
 */
export function importBackup(text: string): ImportResult {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (data?.format !== BACKUP_FORMAT) throw new Error("Not a FaustMod backup file.");

  const res: ImportResult = { modules: 0, pdModules: 0, saved: 0, settings: 0 };

  for (const b of (data.customBlocks as Parameters<typeof CustomBlocks.add>[0][]) ?? []) {
    CustomBlocks.add(b);
    res.modules++;
  }
  for (const m of (data.pdModules as Parameters<typeof PdModules.add>[0][]) ?? []) {
    PdModules.add(m);
    res.pdModules++;
  }
  for (const p of (data.savedPatches as Parameters<typeof SavedPatches.add>[0][]) ?? []) {
    SavedPatches.add(p);
    res.saved++;
  }
  // Backward-compat: fold an old backup's embeddable patches into the single store.
  for (const e of (data.embeddablePatches as { id: string; title: string; patch: unknown }[]) ?? []) {
    SavedPatches.add({ id: e.id, name: e.title, patch: e.patch as never });
    res.saved++;
  }
  const settings = (data.settings as Record<string, unknown>) ?? {};
  for (const [k, v] of Object.entries(settings)) {
    // Only restore keys we recognize, and never a stray API key.
    if (SETTING_KEYS.includes(k) && typeof v === "string") {
      localStorage.setItem(k, v);
      res.settings++;
    }
  }
  return res;
}
