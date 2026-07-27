import { useEffect, useState } from "react";
import type { InputSpec } from "../../audio/types";

interface Props {
  spec: InputSpec;
  /** The port's current resting value (adjusted default, or the declared one). */
  value: number;
  /** A signal is wired in, so it — not this value — drives the port. */
  connected: boolean;
  onCommit: (value: number) => void;
}

/** Arrow-key step scaled to the port's declared range. Undeclared (signal inputs) means
 *  an audio-range DC offset, where whole numbers would be uselessly coarse. */
function stepFor(spec: InputSpec): number {
  if (spec.min === undefined || spec.max === undefined) return 0.01;
  const span = Math.abs(spec.max - spec.min);
  if (span <= 2) return 0.01;
  if (span <= 20) return 0.1;
  return 1;
}

/**
 * The editable default sitting on an input. Unconnected, this IS the value the port holds,
 * so it's the fastest way to dial a patch in — no constant node needed. A control input
 * starts at its declared default; a signal input starts at 0 (silence) and can be pushed
 * off zero to feed the port a fixed DC level. Wire something in and it greys out (the
 * signal wins) but keeps its value, which comes back when the connection is removed.
 *
 * Values are clamped to the port's declared range on commit: these feed Faust DSP
 * directly, and out-of-range control values are exactly what makes a zero-delay-feedback
 * filter blow up to NaN and go silent.
 */
export function PortValue({ spec, value, connected, onCommit }: Props) {
  const [draft, setDraft] = useState(() => String(value));
  // Follow external changes (load, paste, undo) unless the user is mid-edit.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = (text: string) => {
    setEditing(false);
    const n = Number(text);
    if (!Number.isFinite(n)) {
      setDraft(String(value)); // revert junk
      return;
    }
    const lo = spec.min ?? -Infinity;
    const hi = spec.max ?? Infinity;
    const clamped = Math.min(hi, Math.max(lo, n));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  const range =
    spec.min !== undefined && spec.max !== undefined ? ` (${spec.min}–${spec.max})` : "";
  return (
    <input
      className="dsp-port-value"
      type="number"
      value={draft}
      step={stepFor(spec)}
      min={spec.min}
      max={spec.max}
      disabled={connected}
      title={
        connected
          ? `Driven by the connected signal — unplug it to use this value${range}`
          : spec.default === undefined
            ? `${spec.label}: resting level while nothing is wired in (0 = silence)`
            : `${spec.label} value${spec.unit ? ` in ${spec.unit}` : ""}${range}`
      }
      // rete would otherwise drag the node, and the canvas would swallow the keys
      // (Delete removes the node, ⌘A selects everything).
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        setDraft(e.target.value);
        setEditing(true);
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit(e.currentTarget.value);
        else if (e.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
