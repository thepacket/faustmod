import { useEffect, useReducer, useState } from "react";
import { SavedPatches } from "../patch/savedPatches";
import { COMPONENT_DND_TYPE } from "../components/library";
import { serializePatch, PATCH_EXTENSION } from "../patch/format";
import { derivePatchSignature } from "../patch/signature";
import { download, safeName } from "../patch/download";
import { PanelCollapseButton } from "./PanelCollapse";

interface Props {
  disabled: boolean;
  /** Create a new patch entry and open it in a tab. */
  onNewPatch: () => void;
  /** Load a patch from disk into a tab. */
  onLoadPatch: () => void;
  /** Open a saved patch in a tab. */
  onOpenPatch: (id: string) => void;
  /** Rename a saved patch (and any open tab for it). */
  onRenamePatch: (id: string, name: string) => void;
  /** When set, render the panel's collapse button in this (top) section's header. */
  onCollapse?: () => void;
}

/**
 * The single Patches library. Every entry is a full patch document that opens into a tab
 * (New / Load / double-click). A patch that declares I/O terminals is ALSO embeddable —
 * it gets an ⧉ badge and can be dragged onto a canvas as a node. Rename / download /
 * delete per entry. Persisted in localStorage via SavedPatches.
 */
export function PatchPanel({ disabled, onNewPatch, onLoadPatch, onOpenPatch, onRenamePatch, onCollapse }: Props) {
  const [rev, bump] = useReducer((x) => x + 1, 0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => SavedPatches.subscribe(bump), []);
  void rev;

  const list = SavedPatches.all().sort((a, b) => a.name.localeCompare(b.name));

  const commitRename = (id: string, value: string) => {
    onRenamePatch(id, value);
    setRenamingId(null);
  };

  // Duplicate the currently selected patch into a new "<name> copy" entry.
  const duplicateSelected = () => {
    const src = selectedId && SavedPatches.get(selectedId);
    if (!src) return;
    const taken = new Set(list.map((p) => p.name));
    let copy = `${src.name} copy`;
    for (let n = 2; taken.has(copy); n++) copy = `${src.name} copy ${n}`;
    const id = `saved-${Date.now().toString(36)}`;
    SavedPatches.add({ id, name: copy, patch: { ...structuredClone(src.patch), name: copy } });
    setSelectedId(id);
  };

  return (
    <>
      <div className="library-head">
        <h2>Patches</h2>
        <div className="head-right">
          <span className="count">{list.length}</span>
          {onCollapse && <PanelCollapseButton side="left" onClick={onCollapse} />}
        </div>
      </div>
      <div className="palette-actions">
        <button className="palette-btn" onClick={onNewPatch} disabled={disabled}>
          New
        </button>
        <button className="palette-btn" onClick={onLoadPatch} disabled={disabled}>
          Load
        </button>
        <button
          className="palette-btn"
          onClick={duplicateSelected}
          disabled={disabled || !selectedId}
          title="Duplicate the selected patch"
        >
          Dup
        </button>
      </div>

      {list.length === 0 && (
        <p className="hint">
          No patches yet. <strong>New</strong> starts one in a tab; <strong>Load</strong> opens a{" "}
          <code>.faustmod</code> from disk. Add <strong>In</strong> / <strong>Out</strong> terminals
          to a patch to make it embeddable (⧉) — then drag it onto another patch as a node.
        </p>
      )}

      {list.map((p) => {
        const sig = derivePatchSignature(p.patch.nodes);
        const embeddable = sig.inputs.length > 0 || sig.outputs.length > 0;
        return (
          <div
            key={p.id}
            className={`comp${selectedId === p.id ? " selected" : ""}`}
            // Embeddable patches can be dragged onto a canvas as a node.
            draggable={!disabled && embeddable && renamingId !== p.id}
            onDragStart={(e) => {
              if (!embeddable) return;
              e.dataTransfer.setData(COMPONENT_DND_TYPE, p.id);
              e.dataTransfer.setData("text/plain", p.name);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => setSelectedId(p.id)}
            onDoubleClick={() => onOpenPatch(p.id)}
            title={
              embeddable
                ? `Patch — embeddable (${sig.inputs.length} in / ${sig.outputs.length} out)\nDouble-click to open in a tab · drag onto a canvas to embed`
                : `Patch (${p.patch.nodes.length} nodes)\nDouble-click to open in a tab`
            }
          >
            {renamingId === p.id ? (
              <input
                className="comp-rename"
                autoFocus
                defaultValue={p.name}
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
              // Display-only " (mod)" tag for embeddable patches (usable as modules); the
              // stored name is unchanged.
              <span className="comp-name">{embeddable ? `${p.name} (mod)` : p.name}</span>
            )}
            <button
              className="comp-act"
              title="Save this patch to disk (.faustmod)"
              onClick={(e) => {
                e.stopPropagation();
                download(`${safeName(p.name)}${PATCH_EXTENSION}`, serializePatch(p.patch), "application/json");
              }}
            >
              ⭳
            </button>
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
                if (window.confirm(`Delete the patch “${p.name}”? This cannot be undone.`))
                  SavedPatches.remove(p.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </>
  );
}
