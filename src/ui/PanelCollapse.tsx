import { useState } from "react";

/** Persisted collapsed/expanded state for a side panel. */
export function usePanelCollapsed(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(key) === "1");
  const toggle = () =>
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(key, next ? "1" : "0");
      return next;
    });
  return [collapsed, toggle];
}

/** The thin strip a collapsed side panel shows: a vertical label that expands on click. */
export function CollapsedStrip({
  label,
  side,
  onExpand,
}: {
  label: string;
  side: "left" | "right";
  onExpand: () => void;
}) {
  // Chevron points toward the canvas (where the panel will reappear from).
  const chevron = side === "left" ? "›" : "‹";
  return (
    <aside className={`panel ${side === "left" ? "library" : "modules"} collapsed`}>
      <button className="panel-expand" onClick={onExpand} title={`Show ${label}`}>
        <span className="chev">{chevron}</span>
        <span className="vlabel">{label}</span>
      </button>
    </aside>
  );
}

/** The collapse (‹ / ›) button shown in an expanded panel's header. */
export function PanelCollapseButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button className="panel-collapse" onClick={onClick} title="Collapse panel">
      {side === "left" ? "‹" : "›"}
    </button>
  );
}
