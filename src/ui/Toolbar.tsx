interface Props {
  playing: boolean;
  status: string;
  onTogglePlay: () => void;
  onMasterVolume: (v: number) => void;
  onClear: () => void;
  onFit: () => void;
  onSettings: () => void;
}

export function Toolbar({
  playing,
  status,
  onTogglePlay,
  onMasterVolume,
  onClear,
  onFit,
  onSettings,
}: Props) {
  return (
    <header className="toolbar">
      <span className="brand">FaustMod</span>
      <button className={playing ? "btn danger" : "btn primary"} onClick={onTogglePlay}>
        {playing ? "◼ Stop" : "▶ Start Audio"}
      </button>
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
      <button className="btn" onClick={onFit}>
        Fit
      </button>
      <button className="btn" onClick={onClear}>
        Clear
      </button>
      <div className="spacer" />
      <span className="status">{status}</span>
      <button className="btn" onClick={onSettings}>
        ⚙ Settings
      </button>
    </header>
  );
}
