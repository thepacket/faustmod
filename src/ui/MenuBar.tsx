import { useEffect, useState } from "react";

export interface MenuItem {
  label?: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
}
export interface Menu {
  label: string;
  items: MenuItem[];
}

interface Props {
  menus: Menu[];
  patchName: string;
  dirty: boolean;
  playing: boolean;
  recording: boolean;
  status: string;
  onTogglePlay: () => void;
  onToggleRecord: () => void;
  onMasterVolume: (v: number) => void;
}

export function MenuBar({
  menus,
  patchName,
  dirty,
  playing,
  recording,
  status,
  onTogglePlay,
  onToggleRecord,
  onMasterVolume,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);

  // Close any open menu on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="menubar">
      <span className="brand">FaustMod</span>

      <nav className="menus">
        {menus.map((menu) => (
          <div className="menu" key={menu.label}>
            <button
              className={`menu-label ${open === menu.label ? "active" : ""}`}
              onClick={() => setOpen(open === menu.label ? null : menu.label)}
              onMouseEnter={() => open && setOpen(menu.label)}
            >
              {menu.label}
            </button>
            {open === menu.label && (
              <div className="menu-dropdown">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div className="menu-sep" key={i} />
                  ) : (
                    <button
                      key={i}
                      className="menu-item"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpen(null);
                        item.onClick?.();
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && <kbd>{item.shortcut}</kbd>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <span className="patch-name">
        {patchName}
        {dirty ? " •" : ""}
      </span>

      <div className="spacer" />

      <span className="status">{status}</span>
      <label className="vol">
        Master
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.8}
          onChange={(e) => onMasterVolume(Number(e.target.value))}
        />
      </label>
      <button
        className={`btn rec-btn ${recording ? "recording" : ""}`}
        onClick={onToggleRecord}
        title={recording ? "Stop recording & download" : "Record master output"}
      >
        {recording ? "◼ Rec" : "● Rec"}
      </button>
      <button className={playing ? "btn danger" : "btn primary"} onClick={onTogglePlay}>
        {playing ? "◼ Stop" : "▶ Start"}
      </button>

      {/* click-away overlay */}
      {open && <div className="menu-overlay" onClick={() => setOpen(null)} />}
    </header>
  );
}
