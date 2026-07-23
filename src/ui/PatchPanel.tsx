import { useEffect, useReducer, useState } from "react";
import { EmbeddablePatches } from "../patch/embeddablePatches";
import { COMPONENT_DND_TYPE } from "../components/library";

interface Props {
  disabled: boolean;
  /** Register the current patch as embeddable (App snapshots + derives the signature). */
  onAddPatch: () => void;
}

/**
 * Bottom section of the right column: the user's embeddable patches. Each renders like
 * a component/DSP chip — drag it onto the canvas to drop the patch in as a single node
 * (its I/O terminals become the node's ports). Rename (✎) / delete (×). Persisted in
 * localStorage via EmbeddablePatches.
 */
export function PatchPanel({ disabled, onAddPatch }: Props) {
  const [rev, bump] = useReducer((x) => x + 1, 0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  useEffect(() => EmbeddablePatches.subscribe(bump), []);

  const list = EmbeddablePatches.all().sort((a, b) => a.title.localeCompare(b.title));
  void rev;

  const commitRename = (id: string, value: string) => {
    EmbeddablePatches.rename(id, value);
    setRenamingId(null);
  };

  return (
    <>
      <div className="library-head">
        <h2>Patches</h2>
        <span className="count">{list.length}</span>
      </div>
      <div className="palette-actions">
        <button className="palette-btn" onClick={onAddPatch} disabled={disabled}>
          + Add current patch
        </button>
      </div>

      {list.length === 0 && (
        <p className="hint">
          No embeddable patches yet. Add <strong>In</strong> / <strong>Out</strong> terminals to a
          patch to define its ports, then <strong>+ Add current patch</strong> to reuse it inside
          other patches.
        </p>
      )}

      {list.map((p) => (
        <div
          key={p.id}
          className="comp"
          draggable={!disabled && renamingId !== p.id}
          onDragStart={(e) => {
            e.dataTransfer.setData(COMPONENT_DND_TYPE, p.id);
            e.dataTransfer.setData("text/plain", p.title);
            e.dataTransfer.effectAllowed = "copy";
          }}
          title={`Embedded patch (${p.inputs.length} in / ${p.outputs.length} out)\nDrag onto the canvas`}
        >
          {renamingId === p.id ? (
            <input
              className="comp-rename"
              autoFocus
              defaultValue={p.title}
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => commitRename(p.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(p.id, e.currentTarget.value);
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <span className="comp-name">{p.title}</span>
          )}
          <button
            className="comp-act"
            title="Rename this patch"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingId(p.id);
            }}
          >
            ✎
          </button>
          <button
            className="comp-act"
            title="Delete this patch"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete the patch “${p.title}”? This cannot be undone.`))
                EmbeddablePatches.remove(p.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}
