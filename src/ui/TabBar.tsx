import type { TabInfo } from "../patch/TabsManager";

interface Props {
  tabs: TabInfo[];
  active: number;
  onSelect: (i: number) => void;
  onClose: (i: number) => void;
}

/**
 * The open-patch tabs. Tabs are opened from the Patches library (New / Load / double-
 * click), never here — so there's no "+" new-tab button; the user can only switch and
 * close tabs.
 */
export function TabBar({ tabs, active, onSelect, onClose }: Props) {
  return (
    <div className="tabbar">
      {tabs.map((t, i) => (
        <div
          key={t.id}
          className={`tab ${i === active ? "active" : ""}`}
          onClick={() => onSelect(i)}
          title={t.name}
        >
          <span className="tab-name">{t.name}</span>
          {t.dirty && <span className="tab-dot">•</span>}
          <button
            className="tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(i);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
