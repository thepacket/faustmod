import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Dark editor chrome matching the FaustMod panels. */
export const faustEditorTheme = EditorView.theme(
  {
    "&": {
      color: "#e6e8ee",
      backgroundColor: "#16181e",
      fontSize: "14px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
      lineHeight: "1.5",
    },
    ".cm-content": { caretColor: "#57d977" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#57d977" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "#2c5138",
    },
    ".cm-gutters": {
      backgroundColor: "#12141a",
      color: "#5b6270",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.035)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.05)" },
    ".cm-selectionMatch": { backgroundColor: "#33415a" },
    "&.cm-focused .cm-matchingBracket, .cm-matchingBracket": {
      backgroundColor: "#2c5138",
      color: "#fff",
      outline: "1px solid #57d977",
    },
    ".cm-panels": { backgroundColor: "#1b1e25", color: "#e6e8ee" },
    ".cm-searchMatch": { backgroundColor: "rgba(87,217,119,0.25)", outline: "1px solid #57d977" },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(87,217,119,0.45)" },
    ".cm-tooltip": { backgroundColor: "#1b1e25", border: "1px solid #2a2e38" },
  },
  { dark: true },
);

/** Faust token colours (Material-ish palette). */
const faustHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "#c792ea" },
  { tag: t.comment, color: "#6b7280", fontStyle: "italic" },
  { tag: t.string, color: "#c3e88d" },
  { tag: t.number, color: "#f78c6c" },
  { tag: t.operator, color: "#89ddff" },
  { tag: t.namespace, color: "#82aaff" },
  { tag: t.variableName, color: "#e6e8ee" },
]);

export const faustHighlighting = syntaxHighlighting(faustHighlightStyle);
