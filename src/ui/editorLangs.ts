import type { Extension } from "@codemirror/state";
import { generateDsp, generatePatch } from "../ai/openrouter";
import { FaustService } from "../audio/FaustService";
import { parsePatch } from "../patch/format";
import { validatePatch } from "../patch/validate";
import { faustLanguage } from "./editor/faustLanguage";
import { faustEditorTheme, faustHighlighting } from "./editor/faustTheme";

/** Everything the shared CodeEditor needs that differs by language. */
export interface EditorLang {
  /** CodeMirror language/theme extensions. */
  extensions: Extension[];
  /** localStorage key for the remembered AI prompt (separate per language). */
  promptKey: string;
  promptPlaceholder: string;
  /** AI generation for the Make button. */
  generate: (prompt: string, code: string) => Promise<string>;
  /** Validate the source; returns a success message, throws with an error message. */
  compile: (code: string) => Promise<string>;
  /** Tidy a raw compiler error for display. */
  formatError: (message: string) => string;
}

export const faustLang: EditorLang = {
  extensions: [faustLanguage, faustEditorTheme, faustHighlighting],
  promptKey: "faustmod.aiPrompt",
  promptPlaceholder:
    "Describe the DSP to make… (uses your OpenRouter key — set it in File → Settings). ⌘/Ctrl+Enter.",
  generate: generateDsp,
  compile: async (code) => {
    const c = await FaustService.compile(`edit-${Date.now()}`, code);
    return `✓ Compiled — ${c.numInputs} in · ${c.numOutputs} out`;
  },
  // libfaust errors read like "edit-1784…:5 : ERROR : syntax error…".
  formatError: (message) => {
    const first = message.split("\n")[0].trim();
    const m = first.match(/^[^\s:]+:(\d+)\s*:\s*ERROR\s*:\s*(.*)$/i);
    return m ? `Line ${m[1]}: ${m[2]}` : first;
  },
};

/**
 * Whole-patch generation (Patches → Gen). The document is a `.faustmod` JSON file rather
 * than source, so "compile" means parse + validate against the real catalog; the Fix
 * button then hands any problems back to the model. No JSON syntax mode is bundled —
 * CodeMirror's bracket matching and the shared theme are enough for generated JSON.
 */
export const patchLang: EditorLang = {
  extensions: [faustEditorTheme],
  promptKey: "faustmod.patchPrompt",
  promptPlaceholder:
    "Describe the patch to make… (uses your OpenRouter key — set it in File → Settings). ⌘/Ctrl+Enter.",
  generate: generatePatch,
  compile: async (json) => {
    const patch = parsePatch(json);
    const issues = validatePatch(patch);
    if (issues.length) throw new Error(issues.join("\n"));
    return `✓ Valid — ${patch.nodes.length} nodes · ${patch.connections.length} connections`;
  },
  formatError: (message) => {
    const lines = message.split("\n").filter((l) => l.trim());
    return lines.length > 1 ? `${lines[0]} (+${lines.length - 1} more)` : (lines[0] ?? message);
  },
};
