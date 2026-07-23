import { useEffect, useReducer, useRef, useState } from "react";
import { PdModules, parsePdPorts } from "../patch/pdModules";
import { COMPONENT_DND_TYPE } from "../components/library";
import { generatePd } from "../ai/openrouter";

/**
 * The dedicated "Pd DSP" section. A Pd module is a loaded `.pd` file — we don't edit Pd
 * diagrams in FaustMod. "+ New Pd DSP" opens a file picker; the file's top-level
 * inlet~/outlet~ become the module's ports. Chips look like component/DSP nodes: drag
 * onto the canvas to place, rename (✎) / delete (×). Persisted via PdModules.
 */
export function PdPanel({ disabled }: { disabled: boolean }) {
  const [rev, bump] = useReducer((x) => x + 1, 0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // last generated .pd that failed to compile
  const [draftErr, setDraftErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => PdModules.subscribe(bump), []);
  void rev;

  const list = PdModules.all().sort((a, b) => a.title.localeCompare(b.title));

  const addPd = (code: string, fallbackTitle: string): string => {
    const { inputs, outputs, name, desc } = parsePdPorts(code);
    const title = name || fallbackTitle;
    const id = `pd-${Date.now().toString(36)}`;
    PdModules.add({ id, title, code, inputs, outputs, desc });
    return `${title} — ${inputs.length} in / ${outputs.length} out`;
  };

  // Compile the generated .pd with WebPd. On success, add it as a module. On failure,
  // keep it as a draft with its error so the user can click Fix to retry.
  const validateAndAdd = async (code: string): Promise<void> => {
    const { compilePd } = await import("../audio/PdEngine");
    const channelCountIn = Math.max(2, parsePdPorts(code).inputs.length);
    try {
      await compilePd(code, channelCountIn); // throws on unsupported objects / bad syntax
      setNote(`Made "${addPd(code, "Pd Module")}"`);
      setDraft(null);
      setDraftErr("");
      setPrompt("");
    } catch (e) {
      const msg = (e as Error).message;
      setDraft(code);
      setDraftErr(msg);
      setNote(`✗ ${msg.split("\n")[0]} — click Fix to retry`);
    }
  };

  // Generate a Pd module from the prompt (Pd system prompt + your OpenRouter key).
  const make = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setNote("Generating…");
    setDraft(null);
    setDraftErr("");
    try {
      await validateAndAdd(await generatePd(prompt));
    } catch (e) {
      setNote(`✗ ${(e as Error).message.split("\n")[0]}`);
    } finally {
      setBusy(false);
    }
  };

  // One user-triggered correction: feed the compile error of the failing draft back
  // to the model and re-validate.
  const fix = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setNote("Fixing…");
    try {
      const corrected = await generatePd(
        `This patch failed to compile in WebPd:\n${draftErr}\nFix it — replace any unsupported object with a supported vanilla one and correct the syntax. Keep the original intent.`,
        draft,
      );
      await validateAndAdd(corrected);
    } catch (e) {
      setNote(`✗ ${(e as Error).message.split("\n")[0]}`);
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-loading the same filename later
    if (!file) return;
    try {
      const code = await file.text();
      setNote(`Loaded "${addPd(code, file.name.replace(/\.pd$/i, ""))}"`);
    } catch {
      setNote("Could not read that .pd file.");
    }
  };

  const commitRename = (id: string, value: string) => {
    PdModules.rename(id, value);
    setRenamingId(null);
  };

  return (
    <>
      <div className="library-head">
        <h2>Pd DSP</h2>
        <span className="count">{list.length}</span>
      </div>
      <div className="palette-actions">
        <button className="palette-btn" onClick={() => fileRef.current?.click()} disabled={disabled}>
          + New Pd DSP
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pd"
          style={{ display: "none" }}
          onChange={onFile}
        />
      </div>
      <div className="fe-ai">
        <textarea
          className="fe-prompt"
          rows={2}
          placeholder="Describe a Pd module to make with AI… (⌘/Ctrl+Enter)"
          value={prompt}
          disabled={busy || disabled}
          spellCheck={false}
          autoComplete="off"
          data-gramm="false"
          data-1p-ignore="true"
          data-lpignore="true"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void make();
            }
          }}
        />
        <button className="btn" disabled={busy || disabled || !prompt.trim()} onClick={make}>
          Make
        </button>
        {draft && (
          <button
            className="btn"
            disabled={busy || disabled}
            title="Send the compile error back to the AI for one correction"
            onClick={fix}
          >
            Fix
          </button>
        )}
      </div>
      {note && <p className="hint sm">{note}</p>}

      {list.length === 0 && (
        <p className="hint">
          No Pd modules yet. <strong>+ New Pd DSP</strong> loads a <code>.pd</code> file, run by
          WebPd. Audio I/O is via <code>adc~</code> (in) / <code>dac~</code> (out), stereo.
        </p>
      )}

      {list.map((m) => (
        <div
          key={m.id}
          className="comp"
          draggable={!disabled && renamingId !== m.id}
          onDragStart={(e) => {
            e.dataTransfer.setData(COMPONENT_DND_TYPE, m.id);
            e.dataTransfer.setData("text/plain", m.title);
            e.dataTransfer.effectAllowed = "copy";
          }}
          title={`Pd module (${m.inputs.length} in / ${m.outputs.length} out)\nDrag onto the canvas`}
        >
          {renamingId === m.id ? (
            <input
              className="comp-rename"
              autoFocus
              defaultValue={m.title}
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => commitRename(m.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(m.id, e.currentTarget.value);
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <span className="comp-name">{m.title}</span>
          )}
          <button
            className="comp-act"
            title="Rename this Pd module"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingId(m.id);
            }}
          >
            ✎
          </button>
          <button
            className="comp-act"
            title="Delete this Pd module"
            onClick={(e) => {
              e.stopPropagation();
              PdModules.remove(m.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}
