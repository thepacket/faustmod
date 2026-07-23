import { useEffect, useReducer, useState } from "react";
import { EmbeddablePatches } from "../patch/embeddablePatches";
import { SavedPatches } from "../patch/savedPatches";
import { COMPONENT_DND_TYPE } from "../components/library";
import { serializePatch, PATCH_EXTENSION } from "../patch/format";
import { download, safeName } from "../patch/download";

interface Props {
  disabled: boolean;
  /** Register the current patch as embeddable (App snapshots + derives the signature). */
  onAddPatch: () => void;
  /** Store the current patch document in the Saved Patches library. */
  onSavePatch: () => void;
  /** Open a saved patch document into a new tab. */
  onOpenPatch: (id: string) => void;
}

/**
 * Bottom section of the right column. Two libraries:
 *  - Saved Patches: full patch documents (open into a tab) — so a patch survives closing
 *    its tab. Each can be opened, downloaded (.faustmod), renamed, deleted.
 *  - Patches (embeddable): each drops into a patch as a single node (its I/O terminals
 *    become the node's ports).
 * Both persist in localStorage.
 */
export function PatchPanel({ disabled, onAddPatch, onSavePatch, onOpenPatch }: Props) {
  const [rev, bump] = useReducer((x) => x + 1, 0);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  useEffect(() => EmbeddablePatches.subscribe(bump), []);
  useEffect(() => SavedPatches.subscribe(bump), []);
  void rev;

  const saved = SavedPatches.all().sort((a, b) => a.name.localeCompare(b.name));
  const embeddable = EmbeddablePatches.all().sort((a, b) => a.title.localeCompare(b.title));

  const commitRenameEmbed = (id: string, value: string) => {
    EmbeddablePatches.rename(id, value);
    setRenamingId(null);
  };
  const commitRenameSaved = (id: string, value: string) => {
    SavedPatches.rename(id, value);
    setRenamingId(null);
  };

  return (
    <>
      {/* ---- Saved (full, non-embedded) patches ---- */}
      <div className="library-head">
        <h2>Saved Patches</h2>
        <span className="count">{saved.length}</span>
      </div>
      <div className="palette-actions">
        <button className="palette-btn" onClick={onSavePatch} disabled={disabled}>
          + Save current patch
        </button>
      </div>

      {saved.length === 0 && (
        <p className="hint">
          No saved patches. <strong>+ Save current patch</strong> keeps the current tab here so
          it isn&apos;t lost when the tab is closed. Click one to open it in a new tab.
        </p>
      )}

      {saved.map((p) => (
        <div
          key={p.id}
          className="comp"
          onDoubleClick={() => onOpenPatch(p.id)}
          title={`Saved patch (${p.patch.nodes.length} nodes)\nClick to open in a new tab`}
          role="button"
          onClick={() => renamingId !== p.id && onOpenPatch(p.id)}
        >
          {renamingId === p.id ? (
            <input
              className="comp-rename"
              autoFocus
              defaultValue={p.name}
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => commitRenameSaved(p.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRenameSaved(p.id, e.currentTarget.value);
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <span className="comp-name">{p.name}</span>
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
            title="Delete this saved patch"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete the saved patch “${p.name}”? This cannot be undone.`))
                SavedPatches.remove(p.id);
            }}
          >
            ×
          </button>
        </div>
      ))}

      <div className="section-divider" />

      {/* ---- Embeddable patches ---- */}
      <div className="library-head">
        <h2>Patches</h2>
        <span className="count">{embeddable.length}</span>
      </div>
      <div className="palette-actions">
        <button className="palette-btn" onClick={onAddPatch} disabled={disabled}>
          + Add current patch
        </button>
      </div>

      {embeddable.length === 0 && (
        <p className="hint">
          No embeddable patches yet. Add <strong>In</strong> / <strong>Out</strong> terminals to a
          patch to define its ports, then <strong>+ Add current patch</strong> to reuse it inside
          other patches.
        </p>
      )}

      {embeddable.map((p) => (
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
              onBlur={(e) => commitRenameEmbed(p.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRenameEmbed(p.id, e.currentTarget.value);
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <span className="comp-name">{p.title}</span>
          )}
          <button
            className="comp-act"
            title="Save this patch to disk (.faustmod)"
            onClick={(e) => {
              e.stopPropagation();
              download(`${safeName(p.title)}${PATCH_EXTENSION}`, serializePatch(p.patch), "application/json");
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
