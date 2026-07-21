import { Modal } from "./Modal";
import { LibraryService } from "../components/LibraryService";

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="FaustMod" onClose={onClose} width={440}>
      <p className="hint">
        A browser-based modular audio synthesis IDE. Patch{" "}
        <strong>{LibraryService.components.length}</strong> DSP components on a node
        canvas; DSP is written in{" "}
        <a href="https://faust.grame.fr/" target="_blank" rel="noreferrer">
          Faust
        </a>{" "}
        and runs as WebAssembly AudioWorklets.
      </p>
      <p className="hint">
        Create your own blocks with <strong>Block → Import DSP Block</strong>, and use{" "}
        <strong>Help → Copy Catalog for AI</strong> to have an external AI design blocks and
        patches you can paste in.
      </p>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
