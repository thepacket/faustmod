import { useEffect, useMemo, useReducer, useState } from "react";
import { CustomBlocks } from "../components/customBlocks";
import { COMPONENT_DND_TYPE, type ComponentDef } from "../components/library";
import { FaustService } from "../audio/FaustService";
import { derivePorts } from "../audio/faustIO";
import { usePanelCollapsed, CollapsedStrip, PanelCollapseButton } from "./PanelCollapse";

interface Props {
  disabled: boolean;
  /** Open the Faust editor for a user-defined DSP module. */
  onEdit: (def: ComponentDef, readOnly: boolean) => void;
}

// A functional starter DSP that demonstrates the connector convention: the signal
// args of `process` are audio-input connectors; a slider DECLARES a named control-input
// connector (with default + range) — in FaustMod it's an input port, not a knob.
// This one sums two audio inputs (a, b) and scales them by the control input `m`.
const NEW_MODULE_CODE = `import("stdfaust.lib");
// Signal args = audio inputs; a slider declares a control-input connector:
m = hslider("m", 1.0, 0, 2, 0.001);
process(a, b) = (a + b) * m;`;
const FAUST_DOCS = "https://faustdoc.grame.fr/manual/syntax/";

/**
 * Right-hand palette of the user's own Faust DSP ("modules" in code). A flat,
 * searchable list persisted in localStorage via CustomBlocks: create with New,
 * double-click to edit, rename (✎) and delete (×), drag onto the canvas. Dirty
 * (saved-but-not-compiled) modules show an amber dot.
 */
export function ModulePanel({ disabled, onEdit }: Props) {
  const [panelCollapsed, togglePanel] = usePanelCollapsed("faustmod.panel.modules");
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [rev, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => CustomBlocks.subscribe(bump), []);

  const mods = useMemo(() => CustomBlocks.all(), [rev]);
  const q = query.trim().toLowerCase();
  const list = useMemo(
    () =>
      mods
        .filter((c) => !q || c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [mods, q],
  );

  const createNew = async () => {
    const taken = new Set(mods.map((m) => m.title));
    let n = 1;
    while (taken.has(`Untitled ${n}`)) n++;
    const id = `user-untitled-${Date.now().toString(36)}`;
    // Compile the template so the new module's connectors match its code (audio in +
    // the declared "gain" control input + audio out). Falls back to in/out on failure.
    let inputs: ComponentDef["inputs"] = [{ label: "in" }];
    let outputs: ComponentDef["outputs"] = [{ label: "out" }];
    try {
      const compiled = await FaustService.compile(`${id}-new`, NEW_MODULE_CODE);
      ({ inputs, outputs } = derivePorts(compiled.generator.getJSON()));
    } catch {
      /* keep the in/out fallback */
    }
    CustomBlocks.add({ id, title: `Untitled ${n}`, category: "Custom", inputs, outputs, code: NEW_MODULE_CODE });
  };

  const commitRename = (id: string, value: string) => {
    CustomBlocks.rename(id, value);
    setRenamingId(null);
  };

  const portSummary = (def: ComponentDef) => {
    const audioIn = def.inputs.filter((i) => !i.paramPath).length;
    const params = def.inputs.length - audioIn;
    return `${def.tooltip ?? ""} (${audioIn} in / ${def.outputs.length} out${
      params ? ` · ${params} params` : ""
    })`.trim();
  };

  if (panelCollapsed) {
    return <CollapsedStrip label="User Defined DSP" side="right" onExpand={togglePanel} />;
  }

  return (
    <aside className="panel modules">
      <div className="library-head">
        <h2>User Defined DSP</h2>
        <div className="head-right">
          <span className="count">{list.length}</span>
          <PanelCollapseButton side="right" onClick={togglePanel} />
        </div>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search your DSP…"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="palette-actions">
        <button className="palette-btn" onClick={createNew} disabled={disabled}>
          + New DSP
        </button>
      </div>

      {mods.length === 0 && (
        <p className="hint">
          No DSP yet. Click <strong>+ New DSP</strong> to write one in Faust. New to the
          language?{" "}
          <a href={FAUST_DOCS} target="_blank" rel="noreferrer">
            Read the Faust manual
          </a>
          .
        </p>
      )}
      {mods.length > 0 && list.length === 0 && <p className="hint sm">No matches.</p>}

      {list.map((def) => (
        <div
          key={def.id}
          className="comp"
          draggable={!disabled && renamingId !== def.id}
          onDragStart={(e) => {
            e.dataTransfer.setData(COMPONENT_DND_TYPE, def.id);
            e.dataTransfer.setData("text/plain", def.title);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onDoubleClick={() => onEdit(def, false)}
          title={`${portSummary(def)}\nDouble-click to edit · drag onto the canvas`}
        >
          {renamingId === def.id ? (
            <input
              className="comp-rename"
              autoFocus
              defaultValue={def.title}
              spellCheck={false}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onBlur={(e) => commitRename(def.id, e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(def.id, e.currentTarget.value);
                else if (e.key === "Escape") setRenamingId(null);
              }}
            />
          ) : (
            <span className="comp-name">
              {def.dirty && (
                <span className="dirty-dot" title="Modified — not compiled yet">
                  ●
                </span>
              )}
              {def.title}
            </span>
          )}
          <button
            className="comp-act"
            title="Rename this DSP"
            onClick={(e) => {
              e.stopPropagation();
              setRenamingId(def.id);
            }}
          >
            ✎
          </button>
          <button
            className="comp-act"
            title="Delete this DSP"
            onClick={(e) => {
              e.stopPropagation();
              CustomBlocks.remove(def.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </aside>
  );
}
