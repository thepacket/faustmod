import { useEffect, useMemo, useReducer, useRef, useState, type PointerEvent } from "react";
import { MODULES } from "../components/modules";
import { CustomBlocks } from "../components/customBlocks";
import { COMPONENT_DND_TYPE, type ComponentDef } from "../components/library";

interface Props {
  disabled: boolean;
}

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
export function ModulePanel({ disabled }: Props) {
  const [query, setQuery] = useState("");
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

  return (
    <aside className="panel modules">
      <div className="library-head">
        <h2>Modules</h2>
        <span className="count">{searching ? `${shown}/${total}` : total}</span>
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
            My Modules<span className="cat-count">{userMods.length}</span>
          </div>
          <div className="modules-section-body">
            {userList.length === 0 && (
              <p className="hint sm">
                {userMods.length === 0
                  ? "Duplicate an example (below) or import a block to add your own."
                  : "No matches."}
              </p>
            )}
            {userList.map((def) => (
              <div key={def.id} className="comp" {...dragProps(def)}>
                <span className="comp-name">{def.title}</span>
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
                      <div key={def.id} className="comp" {...dragProps(def)}>
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
