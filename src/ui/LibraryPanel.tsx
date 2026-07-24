import { useMemo, useState } from "react";
import { LibraryService } from "../components/LibraryService";
import { COMPONENT_DND_TYPE, type ComponentDef } from "../components/library";
import { usePanelCollapsed, CollapsedStrip, PanelCollapseButton } from "./PanelCollapse";

interface Props {
  disabled: boolean;
}

interface Group {
  category: string;
  items: ComponentDef[];
}

export function LibraryPanel({ disabled }: Props) {
  const [panelCollapsed, togglePanel] = usePanelCollapsed("faustmod.panel.components");
  const [query, setQuery] = useState("");
  // Start with every category collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(LibraryService.components.map((c) => c.category)),
  );
  const all = LibraryService.components;

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (c: ComponentDef) =>
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q);

    const byCat = new Map<string, ComponentDef[]>();
    for (const c of all) {
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
  }, [all, query]);

  const total = all.length;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const searching = query.trim().length > 0;

  const toggle = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  const allCategories = useMemo(() => new Set(all.map((c) => c.category)), [all]);
  const collapseAll = () => setCollapsed(new Set(allCategories));
  const expandAll = () => setCollapsed(new Set());

  if (panelCollapsed) {
    return <CollapsedStrip label="Components" side="right" onExpand={togglePanel} />;
  }

  return (
    <aside className="panel library">
      <div className="library-head">
        {/* Right-docked panel: collapse arrow on the inner (left) edge, count on the right. */}
        <div className="head-left">
          <PanelCollapseButton side="right" onClick={togglePanel} />
          <h2>Components</h2>
        </div>
        <span className="count">{searching ? `${shown}/${total}` : total}</span>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Search components…"
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

      {groups.length === 0 && <p className="hint">No matches.</p>}

      {groups.map(({ category, items }) => {
        const open = searching || !collapsed.has(category);
        return (
          <section key={category}>
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
                  draggable={!disabled}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(COMPONENT_DND_TYPE, def.id);
                    e.dataTransfer.setData("text/plain", def.title);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  title={`${def.tooltip ?? ""}  (${def.inputs.length} in / ${def.outputs.length} out)\nDrag onto the canvas`.trim()}
                >
                  {def.title}
                </div>
              ))}
          </section>
        );
      })}
    </aside>
  );
}
