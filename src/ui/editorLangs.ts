import type { Extension } from "@codemirror/state";
import { generateDsp } from "../ai/openrouter";
import { FaustService } from "../audio/FaustService";
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
