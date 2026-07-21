import { useState } from "react";
import { generatePatch } from "../ai/patchGenerator";
import type { GraphSnapshot } from "../editor/createEditor";
import { Settings } from "../ai/settings";

interface Props {
  disabled: boolean;
  onGenerated: (snap: GraphSnapshot) => void | Promise<void>;
  setStatus: (s: string) => void;
}

const EXAMPLES = [
  "A warm detuned saw bass through a resonant lowpass into stereo output",
  "Filtered noise into a long reverb, sent to both speakers",
  "A sine drone with slow delay feedback",
];

export function AiPanel({ disabled, onGenerated, setStatus }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!prompt.trim()) return;
    if (!Settings.getApiKey()) {
      setStatus("Set your OpenRouter API key in Settings first");
      return;
    }
    setBusy(true);
    setStatus("Asking the AI to design a patch…");
    try {
      const snap = await generatePatch(prompt.trim());
      await onGenerated(snap);
    } catch (err) {
      setStatus(`AI error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="panel ai">
      <h2>AI Patch Designer</h2>
      <p className="hint">Describe a sound; the AI wires up components for you.</p>
      <textarea
        value={prompt}
        disabled={disabled || busy}
        placeholder="e.g. a plucky square-wave lead into a delay"
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
      />
      <button
        className="btn primary full"
        disabled={disabled || busy || !prompt.trim()}
        onClick={generate}
      >
        {busy ? "Generating…" : "Generate Patch"}
      </button>
      <div className="examples">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" disabled={busy} onClick={() => setPrompt(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </aside>
  );
}
