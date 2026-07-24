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
      <p className="hint">
        Copyright © 2026 Andre Paquette. FaustMod&apos;s own code is MIT-licensed; it uses{" "}
        <a href="https://github.com/grame-cncm/faustwasm" target="_blank" rel="noreferrer">
          @grame/faustwasm
        </a>{" "}
        and{" "}
        <a href="https://github.com/sebpiq/WebPd" target="_blank" rel="noreferrer">
          webpd
        </a>{" "}
        under LGPL-3.0.
      </p>
      <div className="modal-actions">
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
