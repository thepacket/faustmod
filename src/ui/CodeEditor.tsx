import { useEffect, useRef, useState, type PointerEvent } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import type { EditorLang } from "./editorLangs";

interface Props {
  title: string;
  initialCode: string;
  /** Language config: syntax, AI generate, compile/validate (Faust or Pd). */
  lang: EditorLang;
  /** Compile + apply the edited source. Rejects (with a message) on failure. Omitted when read-only. */
  onApply?: (code: string) => Promise<void>;
  /** Save the source WITHOUT compiling (draft). When present, adds a Save button. */
  onSaveDraft?: (code: string) => void;
  onCancel: () => void;
  /** View-only (examples): no Compile/Done, editor is not editable. */
  readOnly?: boolean;
}

/**
 * Floating, draggable source editor shared by Faust and Pd modules. A full CodeMirror 6
 * instance (undo/redo, find, multi-cursor, indent). The AI Make button generates from a
 * prompt; Compile validates; if compilation fails a Fix button feeds the error back to
 * the model. No menu — Cancel / Compile / Save / Done (or Close when read-only).
 */
export function CodeEditor({ title, initialCode, lang, onApply, onSaveDraft, onCancel, readOnly = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<{ msg: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // Last compile error — enables the Fix button (feed it back to the model).
  const [fixError, setFixError] = useState<string | null>(null);
  const [prompt, setPromptState] = useState(() => localStorage.getItem(lang.promptKey) ?? "");
  const setPrompt = (v: string) => {
    localStorage.setItem(lang.promptKey, v);
    setPromptState(v);
  };
  const [pos, setPos] = useState(() => ({
    x: Math.max(24, Math.round(window.innerWidth / 2 - 340)),
    y: 84,
  }));

  // Build the CodeMirror view once.
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      doc: initialCode,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        ...lang.extensions,
        ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
      ],
    });
    viewRef.current = view;
    view.focus();
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const code = () => viewRef.current?.state.doc.toString() ?? initialCode;
  const setCode = (text: string) => {
    const view = viewRef.current;
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  };

  const generate = async (userPrompt: string) => {
    setBusy(true);
    setStatus({ msg: "Generating…", err: false });
    try {
      const generated = await lang.generate(userPrompt, code());
      setCode(generated);
      setFixError(null);
      setStatus({ msg: "✓ Generated — Compile to check", err: false });
    } catch (e) {
      setStatus({ msg: `✗ ${(e as Error).message.split("\n")[0]}`, err: true });
    } finally {
      setBusy(false);
    }
  };

  const make = () => {
    if (prompt.trim()) void generate(prompt);
  };

  const copyError = async () => {
    if (!fixError) return;
    // Prefer the async Clipboard API; fall back to execCommand for insecure/sandboxed
    // contexts where navigator.clipboard is unavailable.
    try {
      await navigator.clipboard.writeText(fixError);
      setStatus({ msg: "✓ Error copied to clipboard", err: false });
      return;
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = fixError;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setStatus(
        ok
          ? { msg: "✓ Error copied to clipboard", err: false }
          : { msg: "✗ Could not access the clipboard", err: true },
      );
    } catch {
      setStatus({ msg: "✗ Could not access the clipboard", err: true });
    }
  };

  // One correction: send the compile error back to the model to repair the code.
  const fix = () => {
    if (!fixError) return;
    void generate(
      `The current code failed to compile with this error:\n${fixError}\nReturn a corrected version — keep the intent, fix the cause of the error.`,
    );
  };

  const compile = async (): Promise<boolean> => {
    setBusy(true);
    setStatus({ msg: "Compiling…", err: false });
    try {
      const msg = await lang.compile(code());
      setFixError(null);
      setStatus({ msg, err: false });
      return true;
    } catch (e) {
      const raw = (e as Error).message;
      setFixError(raw);
      setStatus({ msg: `✗ ${lang.formatError(raw)}`, err: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const done = async () => {
    if (!onApply) return;
    setBusy(true);
    setStatus({ msg: "Compiling…", err: false });
    try {
      await onApply(code());
      // onApply resolving means the parent tears this panel down.
    } catch (e) {
      const raw = (e as Error).message;
      setFixError(raw);
      setStatus({ msg: `✗ ${lang.formatError(raw)}`, err: true });
      setBusy(false);
    }
  };

  // Drag by the header.
  const onHeaderDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const ox = e.clientX - pos.x;
    const oy = e.clientY - pos.y;
    const move = (ev: globalThis.PointerEvent) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - ox)),
        y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - oy)),
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="faust-editor" style={{ left: pos.x, top: pos.y }}>
      <div className="fe-header" onPointerDown={onHeaderDown}>
        <span className="fe-title">
          {title}
          {readOnly && <span className="fe-ro"> — read-only</span>}
        </span>
      </div>
      <div className="fe-body" ref={hostRef} />
      {!readOnly && (
        <div className="fe-ai">
          <textarea
            className="fe-prompt"
            rows={2}
            placeholder={lang.promptPlaceholder}
            value={prompt}
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
            // Keep browser extensions (Grammarly, password managers) from injecting into
            // this field — their DOM injection fights React's controlled value and can
            // wipe the text on the first keystroke in Chrome.
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            data-1p-ignore="true"
            data-lpignore="true"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                make();
              }
            }}
          />
          <button className="btn" disabled={busy || !prompt.trim()} onClick={make}>
            Make
          </button>
          {fixError && (
            <>
              <button
                className="btn"
                disabled={busy}
                title="Send the compile error back to the AI for one correction"
                onClick={fix}
              >
                Fix
              </button>
              <button
                className="btn"
                title="Copy the full compile error to the clipboard"
                onClick={copyError}
              >
                Copy error
              </button>
            </>
          )}
        </div>
      )}
      <div className={`fe-status ${status?.err ? "err" : ""}`}>{status?.msg ?? ""}</div>
      <div className="fe-actions">
        {readOnly ? (
          <button className="btn primary" onClick={onCancel}>
            Close
          </button>
        ) : (
          <>
            <button className="btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
            <button className="btn" disabled={busy} onClick={compile}>
              Compile
            </button>
            {onSaveDraft && (
              <button
                className="btn"
                disabled={busy}
                title="Save the source without compiling — the module is marked uncompiled"
                onClick={() => onSaveDraft(code())}
              >
                Save
              </button>
            )}
            <button className="btn primary" disabled={busy} onClick={done}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}
