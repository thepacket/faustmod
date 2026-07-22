import { StreamLanguage, type StringStream } from "@codemirror/language";

/**
 * A lightweight Faust syntax mode for CodeMirror (StreamLanguage tokenizer).
 * Covers comments, strings, numbers, the primitive/keyword set, library-namespace
 * prefixes (fi. os. ma. …) and the diagram-composition operators. Enough for
 * readable colouring of short DSP snippets without a full Lezer grammar.
 */

const KEYWORDS = new Set([
  "process", "with", "letrec", "environment", "library", "import", "component",
  "declare", "case", "seq", "par", "sum", "prod", "route", "waveform", "soundfile",
  "ffunction", "fconstant", "fvariable", "button", "checkbox", "vslider", "hslider",
  "nentry", "vgroup", "hgroup", "tgroup", "vbargraph", "hbargraph", "attach",
  "int", "float", "mem", "prefix", "rdtable", "rwtable", "select2", "select3",
  "inputs", "outputs", "par", "xor",
]);

interface FaustState {
  inComment: boolean;
}

export const faustLanguage = StreamLanguage.define<FaustState>({
  name: "faust",
  startState: () => ({ inComment: false }),
  token(stream: StringStream, state: FaustState): string | null {
    // Block comments (possibly multi-line).
    if (state.inComment) {
      if (stream.match(/.*?\*\//)) state.inComment = false;
      else stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.inComment = true;
      return "comment";
    }
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    // Strings (file names, declare metadata).
    if (stream.match(/"(?:[^"\\]|\\.)*"?/)) return "string";
    // Numbers (int / float / scientific).
    if (stream.match(/\d+\.?\d*(e[-+]?\d+)?/i)) return "number";
    // Library namespace prefix, e.g. the `fi` in `fi.lowpass`.
    if (stream.match(/[a-zA-Z_]\w*(?=\s*\.)/)) return "namespace";
    // Identifiers / keywords.
    if (stream.match(/[a-zA-Z_]\w*/)) {
      return KEYWORDS.has(stream.current()) ? "keyword" : "variableName";
    }
    // Diagram-composition operators + arithmetic.
    if (stream.match(/<:|:>|:|~|<|>/)) return "operator";
    if (stream.match(/[-+*/%^=!&|@',]+/)) return "operator";
    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
  },
});
