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

export function AudioSettingsModal({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<DeviceList>({ inputs: [], outputs: [] });
  const [input, setInput] = useState(AudioDevices.inputDeviceId ?? "");
  const [output, setOutput] = useState(AudioDevices.outputDeviceId ?? "");
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      await requestDevicePermission(); // populates device labels
      setDevices(await listAudioDevices());
    })();
  }, []);

  const outputSupported = canSelectOutput();

  const label = (d: MediaDeviceInfo, fallback: string) => d.label || `${fallback} ${d.deviceId.slice(0, 6)}`;

  const applyOutput = async (id: string) => {
    setOutput(id);
    await AudioEngine.setOutputDevice(id);
    setNote(id ? "Output device set." : "");
  };

  return (
    <Modal title="Audio Devices" onClose={onClose} width={440}>
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
          onChange={(e) => void applyOutput(e.target.value)}
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
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
