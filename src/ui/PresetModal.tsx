import { Modal } from "./Modal";
import { PRESETS, type Preset } from "../patch/presets";

interface Props {
  onClose: () => void;
  onOpen: (preset: Preset) => void;
}

/** Browse bundled example patches; picking one opens it in a new tab. */
export function PresetModal({ onClose, onOpen }: Props) {
  return (
    <Modal title="Presets" onClose={onClose} width={460}>
      <p className="hint">
        Hand-built example patches. Open one, then press <strong>Start</strong> to hear it.
      </p>
      {PRESETS.length === 0 && <p className="hint">No presets bundled.</p>}
      <div className="preset-list">
        {PRESETS.map((p) => {
          const nodes = p.patch.nodes.length;
          return (
            <button
              key={p.file}
              className="preset-item"
              onClick={() => {
                onOpen(p);
                onClose();
              }}
            >
              <span className="preset-name">{p.name}</span>
              <span className="preset-meta">{nodes} nodes</span>
            </button>
          );
        })}
      </div>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
