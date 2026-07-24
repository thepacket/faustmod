import { Modal } from "./Modal";

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="FaustMod" onClose={onClose} width={440}>
      <p className="hint">
        FaustMod offers a modular visual design environment to Faust (Functional Audio
        Stream), a functional programming language for sound synthesis and audio processing
        with a strong focus on the design of synthesizers, musical instruments, audio
        effects, etc. See{" "}
        <a href="https://faust.grame.fr/" target="_blank" rel="noreferrer">
          https://faust.grame.fr/
        </a>
      </p>
      <p className="hint">© 2026 Andre Paquette. MIT License.</p>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
