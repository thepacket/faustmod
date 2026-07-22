import { useEffect } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

/** A small floating contextual menu anchored at (x, y). Closes on outside click / Esc. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const left = Math.min(x, window.innerWidth - 200);
  const top = Math.min(y, window.innerHeight - 20 - items.length * 34);

  return (
    <>
      <div className="ctx-overlay" onPointerDown={onClose} onContextMenu={(e) => e.preventDefault()} />
      <div className="ctx-menu" style={{ left, top }}>
        {items.map((it, i) => (
          <button
            key={i}
            className="ctx-item"
            disabled={it.disabled}
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>
  );
}
