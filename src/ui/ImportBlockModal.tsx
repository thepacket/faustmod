import { useState } from "react";
import { Modal } from "./Modal";
import { parseBlock } from "../patch/format";
import { FaustService } from "../audio/FaustService";
import { CustomBlocks } from "../components/customBlocks";

interface Props {
  onClose: () => void;
  onImported: (title: string) => void;
}

const PLACEHOLDER = `{
  "format": "faustmod-block",
  "title": "My Lowpass",
  "category": "Custom",
  "inputs": [
    { "label": "in" },
    { "label": "cutoff", "default": 1000, "min": 20, "max": 20000, "unit": "Hz" }
  ],
  "outputs": [{ "label": "out" }],
  "code": "import(\\"stdfaust.lib\\"); process(x, cutoff) = x : fi.lowpass(2, cutoff);"
}`;

export function ImportBlockModal({ onClose, onImported }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const doImport = async () => {
    setBusy(true);
    setStatus("Parsing…");
    try {
      const block = parseBlock(text);
      setStatus("Compiling Faust…");
      const compiled = await FaustService.compile(block.id, block.code);
      if (compiled.numInputs !== block.inputs.length) {
        throw new Error(
          `Declared ${block.inputs.length} input(s) but the DSP has ${compiled.numInputs}.`,
        );
      }
      if (compiled.numOutputs !== block.outputs.length) {
        throw new Error(
          `Declared ${block.outputs.length} output(s) but the DSP has ${compiled.numOutputs}.`,
        );
      }
      CustomBlocks.add(block);
      onImported(block.title);
      onClose();
    } catch (err) {
      setStatus(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import DSP Block" onClose={onClose} width={560}>
      <p className="hint">
        Paste a block definition (Faust code + ports). It's compiled to verify, then added
        to the palette under its category. Use <strong>Help → Copy Catalog for AI</strong>{" "}
        to get the exact format for an external AI.
      </p>
      <textarea
        className="code-input"
        value={text}
        placeholder={PLACEHOLDER}
        disabled={busy}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        rows={14}
      />
      {status && <p className={status.startsWith("✗") ? "err-msg" : "hint"}>{status}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !text.trim()} onClick={doImport}>
          {busy ? "Compiling…" : "Compile & Add"}
        </button>
      </div>
    </Modal>
  );
}
