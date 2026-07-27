import { useEffect, useRef, useState } from "react";
import { AudioGraph } from "../../audio/AudioGraph";
import type { InputSpec } from "../../audio/types";

interface Props {
  spec: InputSpec;
  /** The port's current resting value (adjusted default, or the declared one). */
  value: number;
  /** A signal is wired in, so it — not this value — drives the port. */
  connected: boolean;
  /** Node id + port index, so a connected port can read what's arriving on the wire. */
  nodeId: string;
  index: number;
  onCommit: (value: number) => void;
}

/** How often a connected port re-reads the incoming signal. Deliberately slow: this is a
 *  glanceable readout on every wired port at once, not a meter. */
const LIVE_POLL_MS = 333;

/** Fit a live value into a narrow field: precision shrinks as the magnitude grows. */
function fmtLive(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  return v.toFixed(3);
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
 * While connected and playing it stops showing the stored value and READS THE WIRE at a
 * few hertz, so a patch's actual operating values are visible at a glance instead of
 * having to wire a monitor onto every point of interest.
 *
 * Values are clamped to the port's declared range on commit: these feed Faust DSP
 * directly, and out-of-range control values are exactly what makes a zero-delay-feedback
 * filter blow up to NaN and go silent.
 */
export function PortValue({ spec, value, connected, nodeId, index, onCommit }: Props) {
  const liveRef = useRef<HTMLInputElement>(null);

  // Poll the incoming signal on a connected port. Written straight to the DOM rather than
  // through state: this runs on every wired port of every node, and re-rendering rete
  // nodes at 3 Hz across a large patch is real work for a value nobody is editing.
  useEffect(() => {
    if (!connected) return;
    const el = liveRef.current;
    if (!el) return;
    const tick = () => {
      const v = AudioGraph.inputProbe(nodeId, index);
      const next = v === null ? String(value) : fmtLive(v);
      if (el.value !== next) el.value = next;
    };
    tick();
    const timer = window.setInterval(tick, LIVE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [connected, nodeId, index, value]);

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

  // Connected: a live readout of the wire, updated imperatively — deliberately NOT a
  // controlled input, so React never fights the polling for the field's value.
  if (connected) {
    return (
      <input
        key="live"
        ref={liveRef}
        className="dsp-port-value dsp-port-live"
        type="text"
        readOnly
        tabIndex={-1}
        defaultValue={String(value)}
        title={`${spec.label}: value arriving on the wire${range}\nUnplug to set it here instead`}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <input
      key="edit"
      className="dsp-port-value"
      type="number"
      value={draft}
      step={stepFor(spec)}
      min={spec.min}
      max={spec.max}
      title={
        spec.default === undefined
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
