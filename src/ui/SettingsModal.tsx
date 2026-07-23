import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import {
  AudioDevices,
  listAudioDevices,
  requestDevicePermission,
  canSelectOutput,
  type DeviceList,
} from "../audio/devices";
import { AudioEngine } from "../audio/AudioEngine";
import {
  OPENROUTER_KEY,
  OPENROUTER_MODEL,
  OPENROUTER_SYSTEM,
  OPENROUTER_PD_SYSTEM,
  DEFAULT_MODEL,
  DEFAULT_SYSTEM_PROMPT,
  DEFAULT_PD_SYSTEM_PROMPT,
  fetchModels,
} from "../ai/openrouter";

// Fallback list used only if the OpenRouter models endpoint can't be reached.
const MODEL_FALLBACK = [
  "anthropic/claude-3.5-sonnet",
  "anthropic/claude-3.7-sonnet",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "deepseek/deepseek-chat",
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<DeviceList>({ inputs: [], outputs: [] });
  const [input, setInput] = useState(AudioDevices.inputDeviceId ?? "");
  const [output, setOutput] = useState(AudioDevices.outputDeviceId ?? "");
  const [note, setNote] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(OPENROUTER_KEY) ?? "");
  const [model, setModel] = useState(() => localStorage.getItem(OPENROUTER_MODEL) ?? DEFAULT_MODEL);
  const [system, setSystem] = useState(
    () => localStorage.getItem(OPENROUTER_SYSTEM) || DEFAULT_SYSTEM_PROMPT,
  );
  const [pdSystem, setPdSystem] = useState(
    () => localStorage.getItem(OPENROUTER_PD_SYSTEM) || DEFAULT_PD_SYSTEM_PROMPT,
  );
  const [models, setModels] = useState<string[]>(MODEL_FALLBACK);
  const [modelsLoading, setModelsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      await requestDevicePermission();
      setDevices(await listAudioDevices());
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    fetchModels()
      .then((ids) => {
        if (alive && ids.length) setModels(ids);
      })
      .catch(() => {
        /* keep fallback */
      })
      .finally(() => {
        if (alive) setModelsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const outputSupported = canSelectOutput();
  const label = (d: MediaDeviceInfo, fallback: string) =>
    d.label || `${fallback} ${d.deviceId.slice(0, 6)}`;

  const save = () => {
    localStorage.setItem(OPENROUTER_KEY, apiKey.trim());
    localStorage.setItem(OPENROUTER_MODEL, model.trim() || DEFAULT_MODEL);
    // Store the system prompt only if it differs from the default (so future default
    // improvements still reach users who never customised it).
    if (system.trim() && system.trim() !== DEFAULT_SYSTEM_PROMPT) {
      localStorage.setItem(OPENROUTER_SYSTEM, system);
    } else {
      localStorage.removeItem(OPENROUTER_SYSTEM);
    }
    if (pdSystem.trim() && pdSystem.trim() !== DEFAULT_PD_SYSTEM_PROMPT) {
      localStorage.setItem(OPENROUTER_PD_SYSTEM, pdSystem);
    } else {
      localStorage.removeItem(OPENROUTER_PD_SYSTEM);
    }
    onClose();
  };

  const modelOptions = models.includes(model) ? models : [model, ...models];

  return (
    <Modal title="Settings" onClose={onClose} width={480}>
      <section className="settings-ai">
        <h3>AI (OpenRouter)</h3>
        <p className="hint">
          Used by the <strong>Make</strong> button in the DSP editor. Your key stays in this
          browser (localStorage) and is sent only to openrouter.ai. Get one at{" "}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">
            openrouter.ai/keys
          </a>
          .
        </p>
        <label>
          API key
          <input
            type="password"
            placeholder="sk-or-…"
            value={apiKey}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>
        <label style={{ marginTop: 12 }}>
          Model {modelsLoading && <span className="hint" style={{ display: "inline" }}>(loading…)</span>}
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginTop: 12 }}>
          <span className="sys-label">
            Faust system prompt
            <button
              type="button"
              className="link-btn"
              disabled={system.trim() === DEFAULT_SYSTEM_PROMPT}
              onClick={() => setSystem(DEFAULT_SYSTEM_PROMPT)}
            >
              Reset to default
            </button>
          </span>
          <textarea
            className="sys-prompt"
            rows={7}
            spellCheck={false}
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            data-1p-ignore="true"
            data-lpignore="true"
            value={system}
            onChange={(e) => setSystem(e.target.value)}
          />
        </label>
        <label style={{ marginTop: 12 }}>
          <span className="sys-label">
            Pd system prompt
            <button
              type="button"
              className="link-btn"
              disabled={pdSystem.trim() === DEFAULT_PD_SYSTEM_PROMPT}
              onClick={() => setPdSystem(DEFAULT_PD_SYSTEM_PROMPT)}
            >
              Reset to default
            </button>
          </span>
          <textarea
            className="sys-prompt"
            rows={7}
            spellCheck={false}
            autoComplete="off"
            data-gramm="false"
            data-gramm_editor="false"
            data-enable-grammarly="false"
            data-1p-ignore="true"
            data-lpignore="true"
            value={pdSystem}
            onChange={(e) => setPdSystem(e.target.value)}
          />
        </label>
      </section>

      <h3 style={{ marginTop: 20 }}>Audio interfaces</h3>
      <label>
        Input (microphone / line in)
        <select
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            AudioDevices.inputDeviceId = e.target.value || null;
            setNote("Input applies to Audio Input nodes on next Start.");
          }}
        >
          <option value="">System default</option>
          {devices.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {label(d, "Input")}
            </option>
          ))}
        </select>
      </label>
      <label style={{ marginTop: 12 }}>
        Output (speakers)
        <select
          value={output}
          disabled={!outputSupported}
          onChange={(e) => {
            setOutput(e.target.value);
            void AudioEngine.setOutputDevice(e.target.value);
            setNote(e.target.value ? "Output device set." : "");
          }}
        >
          <option value="">System default</option>
          {devices.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {label(d, "Output")}
            </option>
          ))}
        </select>
      </label>
      {!outputSupported && (
        <p className="hint">Output device selection isn't supported in this browser.</p>
      )}
      {note && <p className="hint">{note}</p>}

      <div className="modal-actions">
        <button className="btn primary" onClick={save}>
          OK
        </button>
      </div>
    </Modal>
  );
}
