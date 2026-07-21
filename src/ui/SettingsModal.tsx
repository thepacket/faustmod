import { useState } from "react";
import { Settings, DEFAULT_MODEL } from "../ai/settings";

interface Props {
  onClose: () => void;
}

const MODEL_SUGGESTIONS = [
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.7-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
];

export function SettingsModal({ onClose }: Props) {
  const [key, setKey] = useState(Settings.getApiKey());
  const [model, setModel] = useState(Settings.getModel());

  const save = () => {
    Settings.setApiKey(key);
    Settings.setModel(model || DEFAULT_MODEL);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label>
          OpenRouter API key
          <input
            type="password"
            value={key}
            placeholder="sk-or-..."
            onChange={(e) => setKey(e.target.value)}
          />
        </label>
        <p className="hint">
          Stored only in this browser (localStorage). Get a key at openrouter.ai/keys.
        </p>
        <label>
          Model
          <input
            list="models"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="models">
            {MODEL_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
