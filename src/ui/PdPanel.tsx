import { useEffect, useReducer, useRef, useState } from "react";
import { PdModules, parsePdPorts } from "../patch/pdModules";
import { COMPONENT_DND_TYPE } from "../components/library";

interface Props {
  disabled: boolean;
  /** Open the Pd code editor: a module id to edit, or undefined for a new one. */
  onEdit: (id?: string) => void;
}

/**
 * The dedicated "Pd DSP" section. Modules run in the browser via WebPd. Create/edit one
 * in the same code editor + AI generator as Faust ("+ New Pd DSP"), or load an existing
 * `.pd` file ("Load"). Chips look like component/DSP nodes: drag onto the canvas,
 * double-click to edit, rename (✎) / delete (×). Persisted via PdModules.
 */
export function PdPanel({ disabled, onEdit }: Props) {
  const [rev, bump] = useReducer((x) => x + 1, 0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => PdModules.subscribe(bump), []);
  void rev;

  const list = PdModules.all().sort((a, b) => a.title.localeCompare(b.title));

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-loading the same filename later
    if (!file) return;
    try {
      const code = await file.text();
      const { inputs, outputs, name, desc } = parsePdPorts(code);
      const title = name || file.name.replace(/\.pd$/i, "");
      const id = `pd-${Date.now().toString(36)}`;
      PdModules.add({ id, title, code, inputs, outputs, desc });
      setNote(`Loaded "${title}" — ${inputs.length} in / ${outputs.length} out`);
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
          Load
        </button>
        <button className="palette-btn" onClick={() => onEdit(undefined)} disabled={disabled}>
          Editor
        </button>
        <input ref={fileRef} type="file" accept=".pd" style={{ display: "none" }} onChange={onFile} />
      </div>
      {note && <p className="hint sm">{note}</p>}

      {list.length === 0 && (
        <p className="hint">
          No Pd modules yet. <strong>Editor</strong> opens the code editor (write or generate a Pd
          patch with AI); <strong>Load</strong> imports a <code>.pd</code> file. Run by WebPd; audio
          I/O via <code>adc~</code>/<code>dac~</code>.
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
          onDoubleClick={() => onEdit(m.id)}
          title={`Pd module (${m.inputs.length} in / ${m.outputs.length} out)\nDouble-click to edit · drag onto the canvas`}
        >
          {renamingId === m.id ? (
            <input
              className="comp-rename"
              autoFocus
              defaultValue={m.title}
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
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
