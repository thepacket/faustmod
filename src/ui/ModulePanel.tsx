import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from "react";
import { MODULES } from "../components/modules";
import { CustomBlocks } from "../components/customBlocks";
import { COMPONENT_DND_TYPE, type ComponentDef } from "../components/library";
import { usePanelCollapsed, CollapsedStrip, PanelCollapseButton } from "./PanelCollapse";

interface Props {
  disabled: boolean;
  /** Open the Faust editor for a module (readOnly for examples). */
  onEdit: (def: ComponentDef, readOnly: boolean) => void;
}

const NEW_MODULE_CODE = 'import("stdfaust.lib");\n// New module — edit me.\nprocess = _;';

interface Group {
  category: string;
  items: ComponentDef[];
}

const SPLIT_KEY = "faustmod.modulesSplit";
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Right-hand palette of modules, split into two stacked sections sharing the column:
 * the user's own modules on top (editable, deletable — persisted in localStorage via
 * CustomBlocks) and the read-only GRAME example modules below. A draggable horizontal
 * splitter sizes the two. Examples can be duplicated into My Modules (then edited).
 */
export function ModulePanel({ disabled, onEdit }: Props) {
  const [panelCollapsed, togglePanel] = usePanelCollapsed("faustmod.panel.modules");
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [rev, bump] = useReducer((x) => x + 1, 0);
  useEffect(() => CustomBlocks.subscribe(bump), []);

  const userMods = useMemo(() => CustomBlocks.all(), [rev]);
  const exampleMods = MODULES;

  // Example categories collapsed at startup.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(exampleMods.map((c) => c.category)),
  );

  const q = query.trim().toLowerCase();
  const match = (c: ComponentDef) =>
    !q ||
    c.title.toLowerCase().includes(q) ||
    c.id.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q);

  const userList = useMemo(
    () => userMods.filter(match).sort((a, b) => a.title.localeCompare(b.title)),
    [userMods, q],
  );

  const exampleGroups = useMemo<Group[]>(() => {
    const byCat = new Map<string, ComponentDef[]>();
    for (const c of exampleMods) {
      if (!match(c)) continue;
      if (!byCat.has(c.category)) byCat.set(c.category, []);
      byCat.get(c.category)!.push(c);
    }
    return [...byCat.entries()]
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.title.localeCompare(b.title)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [exampleMods, q]);

  const total = userMods.length + exampleMods.length;
  const shown = userList.length + exampleGroups.reduce((n, g) => n + g.items.length, 0);
  const searching = q.length > 0;

  const toggle = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  const collapseAll = () => setCollapsed(new Set(exampleMods.map((c) => c.category)));
  const expandAll = () => setCollapsed(new Set());

  const portSummary = (def: ComponentDef) => {
    const audioIn = def.inputs.filter((i) => !i.paramPath).length;
    const params = def.inputs.length - audioIn;
    return `${def.tooltip ?? ""} (${audioIn} in / ${def.outputs.length} out${
      params ? ` · ${params} params` : ""
    })`.trim();
  };

  const duplicate = (def: ComponentDef) => {
    if (!def.code) return;
    CustomBlocks.add({
      id: `user-${sanitize(def.title)}-${Date.now().toString(36)}`,
      title: `${def.title} copy`,
      category: def.category,
      inputs: def.inputs,
      outputs: def.outputs,
      code: def.code,
    });
  };

  const createNew = () => {
    const taken = new Set(userMods.map((m) => m.title));
    let n = 1;
    while (taken.has(`Untitled ${n}`)) n++;
    const title = `Untitled ${n}`;
    CustomBlocks.add({
      id: `user-untitled-${Date.now().toString(36)}`,
      title,
      category: "Custom",
      inputs: [{ label: "in" }],
      outputs: [{ label: "out" }],
      code: NEW_MODULE_CODE,
    });
  };

  const commitRename = (id: string, value: string) => {
    CustomBlocks.rename(id, value);
    setRenamingId(null);
  };

  const dragProps = (def: ComponentDef) => ({
    draggable: !disabled,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(COMPONENT_DND_TYPE, def.id);
      e.dataTransfer.setData("text/plain", def.title);
      e.dataTransfer.effectAllowed = "copy";
    },
    title: `${portSummary(def)}\nDrag onto the canvas`,
  });

  // --- draggable horizontal splitter ---------------------------------------
  const splitRef = useRef<HTMLDivElement>(null);
  const [topPx, setTopPx] = useState<number>(() => Number(localStorage.getItem(SPLIT_KEY)) || 180);

  const onSplitDown = (e: PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const start = topPx;
    let latest = start;
    const move = (ev: globalThis.PointerEvent) => {
      const box = splitRef.current?.getBoundingClientRect();
      const max = box ? box.height - 90 : 600;
      latest = Math.max(70, Math.min(max, start + (ev.clientY - startY)));
      setTopPx(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      localStorage.setItem(SPLIT_KEY, String(Math.round(latest)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (panelCollapsed) {
    return <CollapsedStrip label="Modules" side="right" onExpand={togglePanel} />;
  }

  return (
    <aside className="panel modules">
      <div className="library-head">
        <h2>Modules</h2>
        <div className="head-right">
          <span className="count">{searching ? `${shown}/${total}` : total}</span>
          <PanelCollapseButton side="right" onClick={togglePanel} />
        </div>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search modules…"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="palette-actions">
        <button className="palette-btn" onClick={collapseAll} disabled={disabled}>
          Collapse
        </button>
        <button className="palette-btn" onClick={expandAll} disabled={disabled}>
          Expand All
        </button>
      </div>

      <div className="modules-split" ref={splitRef}>
        {/* ---- My Modules (user-defined, editable) ---- */}
        <section className="modules-section" style={{ height: topPx }}>
          <div className="modules-section-head">
            My Modules
            <button className="section-new" onClick={createNew} disabled={disabled} title="Create an empty module">
              + New
            </button>
            <span className="cat-count">{userMods.length}</span>
          </div>
          <div className="modules-section-body">
            {userList.length === 0 && (
              <p className="hint sm">
                {userMods.length === 0
                  ? "Click + New, or duplicate an example below, to add your own."
                  : "No matches."}
              </p>
            )}
            {userList.map((def) => (
              <div
                key={def.id}
                className="comp"
                {...dragProps(def)}
                draggable={!disabled && renamingId !== def.id}
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
                  <span className="comp-name">{def.title}</span>
                )}
                <button
                  className="comp-act"
                  title="Rename this module"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(def.id);
                  }}
                >
                  ✎
                </button>
                <button
                  className="comp-act"
                  title="Delete this module"
                  onClick={(e) => {
                    e.stopPropagation();
                    CustomBlocks.remove(def.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        <div
          className="modules-splitter"
          onPointerDown={onSplitDown}
          title="Drag to resize"
          role="separator"
          aria-orientation="horizontal"
        />

        {/* ---- Examples (read-only) ---- */}
        <section className="modules-section grow">
          <div className="modules-section-head">
            Examples<span className="cat-count">{exampleMods.length}</span>
          </div>
          <div className="modules-section-body">
            {exampleMods.length === 0 && (
              <p className="hint sm">No examples built. Run the examples build.</p>
            )}
            {searching && exampleGroups.length === 0 && exampleMods.length > 0 && (
              <p className="hint sm">No matches.</p>
            )}
            {exampleGroups.map(({ category, items }) => {
              const open = searching || !collapsed.has(category);
              return (
                <div key={category}>
                  <button className="cat-header" onClick={() => toggle(category)}>
                    <span className={`chevron ${open ? "open" : ""}`}>▸</span>
                    {category}
                    <span className="cat-count">{items.length}</span>
                  </button>
                  {open &&
                    items.map((def) => (
                      <div
                        key={def.id}
                        className="comp"
                        {...dragProps(def)}
                        onDoubleClick={() => onEdit(def, true)}
                        title={`${portSummary(def)}\nDouble-click to view · drag onto the canvas`}
                      >
                        <span className="comp-name">{def.title}</span>
                        <button
                          className="comp-act"
                          title="Duplicate to My Modules"
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicate(def);
                          }}
                        >
                          ⧉
                        </button>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
