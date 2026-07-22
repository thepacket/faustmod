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
import { OPENROUTER_KEY, OPENROUTER_MODEL, DEFAULT_MODEL } from "../ai/openrouter";

const MODEL_SUGGESTIONS = [
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

  useEffect(() => {
    (async () => {
      await requestDevicePermission();
      setDevices(await listAudioDevices());
    })();
  }, []);

  const outputSupported = canSelectOutput();
  const label = (d: MediaDeviceInfo, fallback: string) =>
    d.label || `${fallback} ${d.deviceId.slice(0, 6)}`;

  const save = () => {
    localStorage.setItem(OPENROUTER_KEY, apiKey.trim());
    localStorage.setItem(OPENROUTER_MODEL, model.trim() || DEFAULT_MODEL);
    onClose();
  };

  return (
    <Modal title="Settings" onClose={onClose} width={480}>
      <h3>Audio interfaces</h3>
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

      <h3 style={{ marginTop: 20 }}>AI (OpenRouter)</h3>
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
        Model
        <input
          list="or-models"
          placeholder={DEFAULT_MODEL}
          value={model}
          spellCheck={false}
          onChange={(e) => setModel(e.target.value)}
        />
      </label>
      <datalist id="or-models">
        {MODEL_SUGGESTIONS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>

      <div className="modal-actions">
        <button className="btn primary" onClick={save}>
          OK
        </button>
      </div>
    </Modal>
  );
}
