import { useEffect, useReducer, useRef, useState } from "react";
import { PdModules, parsePdPorts } from "../patch/pdModules";
import { COMPONENT_DND_TYPE } from "../components/library";

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
      const { inputs, outputs } = parsePdPorts(code);
      const title = file.name.replace(/\.pd$/i, "");
      const id = `pd-${Date.now().toString(36)}`;
      PdModules.add({ id, title, code, inputs, outputs });
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
      {note && <p className="hint sm">{note}</p>}

      {list.length === 0 && (
        <p className="hint">
          No Pd modules yet. <strong>+ New Pd DSP</strong> loads a <code>.pd</code> file; its
          top-level <code>inlet~</code>/<code>outlet~</code> become the node's ports.
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
