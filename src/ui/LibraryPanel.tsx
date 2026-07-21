import { useEffect, useMemo, useReducer, useState } from "react";
import { LibraryService } from "../components/LibraryService";
import { CustomBlocks } from "../components/customBlocks";
import type { ComponentDef } from "../components/library";

interface Props {
  disabled: boolean;
  onAdd: (def: ComponentDef) => void;
}

interface Group {
  category: string;
  items: ComponentDef[];
}

export function LibraryPanel({ disabled, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rev, bump] = useReducer((x) => x + 1, 0);

  // Re-render when custom blocks are added/removed so they appear in the palette.
  useEffect(() => CustomBlocks.subscribe(bump), []);

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
  }, [all, query, rev]);

  const total = all.length;
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const searching = query.trim().length > 0;

  const toggle = (cat: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });

  return (
    <aside className="panel library">
      <div className="library-head">
        <h2>Components</h2>
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
                <button
                  key={def.id}
                  className="comp"
                  disabled={disabled}
                  onClick={() => onAdd(def)}
                  title={`${def.tooltip ?? ""}  (${def.inputs.length} in / ${def.outputs.length} out)`.trim()}
                >
                  {def.title}
                </button>
              ))}
          </section>
        );
      })}
    </aside>
  );
}
