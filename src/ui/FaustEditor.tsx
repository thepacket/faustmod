import { useEffect, useRef, useState, type PointerEvent } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { basicSetup } from "codemirror";
import { FaustService } from "../audio/FaustService";
import { faustLanguage } from "./editor/faustLanguage";
import { faustEditorTheme, faustHighlighting } from "./editor/faustTheme";

interface Props {
  title: string;
  initialCode: string;
  /** Recompile + apply the edited source to the node. Rejects (with a message) on failure. */
  onApply: (code: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Floating, draggable Faust source editor for a module node. A full CodeMirror 6
 * instance (syntax colouring, undo/redo, find, multi-cursor, bracket matching,
 * indent). No menu — just Cancel / Compile / OK.
 */
export function FaustEditor({ title, initialCode, onApply, onCancel }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [status, setStatus] = useState<{ msg: string; err: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
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
        faustLanguage,
        faustEditorTheme,
        faustHighlighting,
      ],
    });
    viewRef.current = view;
    view.focus();
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const code = () => viewRef.current?.state.doc.toString() ?? initialCode;

  const compile = async (): Promise<boolean> => {
    setBusy(true);
    setStatus({ msg: "Compiling…", err: false });
    try {
      const c = await FaustService.compile(`edit-${Date.now()}`, code());
      setStatus({ msg: `✓ Compiled — ${c.numInputs} in · ${c.numOutputs} out`, err: false });
      return true;
    } catch (e) {
      setStatus({ msg: `✗ ${(e as Error).message.split("\n")[0]}`, err: true });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const ok = async () => {
    setBusy(true);
    setStatus({ msg: "Compiling…", err: false });
    try {
      await onApply(code());
      // onApply resolving means the parent tears this panel down.
    } catch (e) {
      setStatus({ msg: `✗ ${(e as Error).message.split("\n")[0]}`, err: true });
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
        <span className="fe-title">{title}</span>
      </div>
      <div className="fe-body" ref={hostRef} />
      <div className={`fe-status ${status?.err ? "err" : ""}`}>{status?.msg ?? ""}</div>
      <div className="fe-actions">
        <button className="btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="btn" disabled={busy} onClick={compile}>
          Compile
        </button>
        <button className="btn primary" disabled={busy} onClick={ok}>
          OK
        </button>
      </div>
    </div>
  );
}
