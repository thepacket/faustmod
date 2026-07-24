import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from "react";
import { CustomBlocks } from "../components/customBlocks";
import { COMPONENT_DND_TYPE, type ComponentDef } from "../components/library";
import { FaustService } from "../audio/FaustService";
import { derivePorts } from "../audio/faustIO";
import { usePanelCollapsed, CollapsedStrip, PanelCollapseButton } from "./PanelCollapse";
import { PatchPanel } from "./PatchPanel";
import { PdPanel } from "./PdPanel";
import { download, safeName } from "../patch/download";

// Pd modules are fully implemented (WebPd engine, editor, AI generation) but the workflow
// is too clunky to ship. Kept in the code; hidden from the UI. Flip to re-expose the
// "Pd DSP" palette section (see PdPanel, PdEngine, pdModules, editorLangs.pdLang).
const SHOW_PD_MODULES = false;

interface Props {
  disabled: boolean;
  /** Open the Faust editor for a user-defined DSP module. */
  onEdit: (def: ComponentDef, readOnly: boolean) => void;
  /** Create a new patch entry and open it in a tab. */
  onNewPatch: () => void;
  /** Load a patch from disk into a tab. */
  onLoadPatch: () => void;
  /** Open a saved patch in a tab. */
  onOpenPatch: (id: string) => void;
  /** Rename a saved patch (and any open tab for it). */
  onRenamePatch: (id: string, name: string) => void;
  /** Open the Pd code editor — with a module id to edit it, or undefined for a new one. */
  onEditPd: (id?: string) => void;
}

const SPLIT_KEY = "faustmod.embedSplit";

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
export function ModulePanel({ disabled, onEdit, onNewPatch, onLoadPatch, onOpenPatch, onRenamePatch, onEditPd }: Props) {
  const [panelCollapsed, togglePanel] = usePanelCollapsed("faustmod.panel.modules");
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rev, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => CustomBlocks.subscribe(bump), []);

  // Draggable horizontal splitter between User Defined DSP (top) and Patches (bottom).
  const asideRef = useRef<HTMLElement>(null);
  const [ratio, setRatio] = useState(() => {
    const v = parseFloat(localStorage.getItem(SPLIT_KEY) ?? "");
    return Number.isFinite(v) ? Math.min(0.85, Math.max(0.15, v)) : 0.6;
  });
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;
  const startDragSplit = (e: PointerEvent) => {
    e.preventDefault();
    const aside = asideRef.current;
    if (!aside) return;
    const rect = aside.getBoundingClientRect();
    const move = (ev: globalThis.PointerEvent) => {
      const r = Math.min(0.85, Math.max(0.15, (ev.clientY - rect.top) / rect.height));
      ratioRef.current = r;
      setRatio(r);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      localStorage.setItem(SPLIT_KEY, ratioRef.current.toFixed(3));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

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
      ({ inputs, outputs } = derivePorts(compiled.generator.getJSON(), NEW_MODULE_CODE));
    } catch {
      /* keep the in/out fallback */
    }
    CustomBlocks.add({ id, title: `Untitled ${n}`, category: "Custom", inputs, outputs, code: NEW_MODULE_CODE });
  };

  const commitRename = (id: string, value: string) => {
    CustomBlocks.rename(id, value);
    setRenamingId(null);
  };

  // Duplicate the currently selected module into a new "<name> copy" entry.
  const duplicateSelected = () => {
    const block = selectedId && CustomBlocks.toDef(selectedId);
    if (!block) return;
    const taken = new Set(mods.map((m) => m.title));
    let name = `${block.title} copy`;
    for (let n = 2; taken.has(name); n++) name = `${block.title} copy ${n}`;
    const id = `user-${Date.now().toString(36)}`;
    CustomBlocks.add({ ...block, id, title: name });
    setSelectedId(id);
  };

  // Load a `.dsp` file as a new user module: compile to derive its connectors, then store.
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-loading the same filename later
    if (!file) return;
    const code = await file.text();
    const title = file.name.replace(/\.dsp$/i, "");
    const id = `user-${Date.now().toString(36)}`;
    let inputs: ComponentDef["inputs"] = [{ label: "in" }];
    let outputs: ComponentDef["outputs"] = [{ label: "out" }];
    try {
      const compiled = await FaustService.compile(id, code);
      ({ inputs, outputs } = derivePorts(compiled.generator.getJSON(), code));
    } catch {
      /* keep the in/out fallback — the user can fix it in the editor */
    }
    CustomBlocks.add({ id, title, category: "Custom", inputs, outputs, code });
  };

  const portSummary = (def: ComponentDef) => {
    const audioIn = def.inputs.filter((i) => !i.paramPath).length;
    const params = def.inputs.length - audioIn;
    return `${def.tooltip ?? ""} (${audioIn} in / ${def.outputs.length} out${
      params ? ` · ${params} params` : ""
    })`.trim();
  };

  if (panelCollapsed) {
    return <CollapsedStrip label="User Defined DSP" side="left" onExpand={togglePanel} />;
  }

  return (
    <aside className="panel modules split-panel" ref={asideRef}>
      <section className="pane pane-top" style={{ flexBasis: `${ratio * 100}%` }}>
        <div className="library-head">
          <h2>Faust DSP</h2>
          <div className="head-right">
            <span className="count">{list.length}</span>
            <PanelCollapseButton side="left" onClick={togglePanel} />
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
            New
          </button>
          <button className="palette-btn" onClick={() => fileRef.current?.click()} disabled={disabled}>
            Load
          </button>
          <button
            className="palette-btn"
            onClick={duplicateSelected}
            disabled={disabled || !selectedId}
            title="Duplicate the selected DSP"
          >
            Dup
          </button>
          <input ref={fileRef} type="file" accept=".dsp" style={{ display: "none" }} onChange={onFile} />
        </div>

        {mods.length === 0 && (
        <p className="hint">
          No DSP yet. Click <strong>New</strong> to write one in Faust, or <strong>Load</strong> a{" "}
          <code>.dsp</code> file. Double-click a chip to edit it. New to the language?{" "}
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
          className={`comp${selectedId === def.id ? " selected" : ""}`}
          draggable={!disabled && renamingId !== def.id}
          onDragStart={(e) => {
            e.dataTransfer.setData(COMPONENT_DND_TYPE, def.id);
            e.dataTransfer.setData("text/plain", def.title);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => setSelectedId(def.id)}
          onDoubleClick={() => onEdit(def, false)}
          title={`${portSummary(def)}\nClick to select · double-click to edit · drag onto the canvas`}
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
            title="Save this DSP to disk (.dsp)"
            onClick={(e) => {
              e.stopPropagation();
              download(`${safeName(def.title)}.dsp`, def.code ?? "", "text/plain");
            }}
          >
            ⭳
          </button>
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
              if (window.confirm(`Delete the module “${def.title}”? This cannot be undone.`))
                CustomBlocks.remove(def.id);
            }}
          >
            ×
          </button>
        </div>
      ))}

        {SHOW_PD_MODULES && (
          <>
            <div className="section-divider" />
            <PdPanel disabled={disabled} onEdit={onEditPd} />
          </>
        )}
      </section>

      <div
        className="pane-splitter"
        onPointerDown={startDragSplit}
        title="Drag to resize"
      />

      <section className="pane pane-bottom">
        <PatchPanel
          disabled={disabled}
          onNewPatch={onNewPatch}
          onLoadPatch={onLoadPatch}
          onOpenPatch={onOpenPatch}
          onRenamePatch={onRenamePatch}
        />
      </section>
    </aside>
  );
}
