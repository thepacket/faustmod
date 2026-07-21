import { useEffect, useMemo, useReducer, useState } from "react";
import { MODULES } from "../components/modules";
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

/**
 * Right-hand palette of user/library modules: the ported GRAME Faust examples plus
 * any DSP blocks the user has imported. Grouped by category (the example directory),
 * searchable and collapsible — mirrors the left component palette.
 */
export function ModulePanel({ disabled, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [rev, bump] = useReducer((x) => x + 1, 0);

  // Re-render when imported custom blocks change.
  useEffect(() => CustomBlocks.subscribe(bump), []);

  const all = useMemo(() => [...MODULES, ...CustomBlocks.all()], [rev]);

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

  const portSummary = (def: ComponentDef) => {
    const audioIn = def.inputs.filter((i) => !i.paramPath).length;
    const params = def.inputs.length - audioIn;
    return `${def.tooltip ?? ""} (${audioIn} in / ${def.outputs.length} out${
      params ? ` · ${params} params` : ""
    })`.trim();
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

      {total === 0 && <p className="hint">No modules yet. Run the examples build, or import a block.</p>}
      {total > 0 && groups.length === 0 && <p className="hint">No matches.</p>}

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
                  title={portSummary(def)}
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
