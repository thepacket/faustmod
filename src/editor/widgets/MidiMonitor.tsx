import { useEffect, useRef, useState } from "react";
import type { WidgetNode } from "./WidgetBridge";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const MAX_LINES = 12;

interface MidiInput {
  name?: string;
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}
interface MidiAccess {
  inputs: Map<string, MidiInput>;
  onstatechange: (() => void) | null;
}

/** Decode the common channel-voice messages; anything else shows as raw bytes. */
function describe(data: Uint8Array): string {
  const [s, d1, d2] = data;
  const cmd = s & 0xf0;
  const ch = (s & 0x0f) + 1;
  if (cmd === 0x90 && d2 > 0) return `ch${ch} note on  ${noteName(d1)} v${d2}`;
  if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) return `ch${ch} note off ${noteName(d1)}`;
  if (cmd === 0xb0) return `ch${ch} cc ${d1} = ${d2}`;
  if (cmd === 0xe0) return `ch${ch} bend ${((d2 << 7) | d1) - 8192}`;
  if (cmd === 0xc0) return `ch${ch} program ${d1}`;
  return [...data].map((b) => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Scrolling log of incoming MIDI — the "print" object every patcher has and FaustMod
 * lacked. Answers "is the controller even sending anything, and what?" without guessing.
 */
export function MidiMonitor({ node }: { node: WidgetNode }) {
  const w = node.width ?? 220;
  const h = node.height ?? 110;
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState("connecting…");
  const seen = useRef(0);

  useEffect(() => {
    const req = (navigator as unknown as { requestMIDIAccess?: () => Promise<MidiAccess> })
      .requestMIDIAccess;
    if (!req) {
      setStatus("Web MIDI not supported");
      return;
    }
    let access: MidiAccess | null = null;
    let cancelled = false;
    const onMsg = (e: { data: Uint8Array }) => {
      seen.current++;
      setLines((prev) => [...prev.slice(-(MAX_LINES - 1)), describe(e.data)]);
    };
    req.call(navigator)
      .then((a) => {
        if (cancelled) return;
        access = a;
        const bind = () => {
          for (const input of a.inputs.values()) input.onmidimessage = onMsg;
          setStatus(a.inputs.size ? `${a.inputs.size} input(s)` : "no MIDI inputs");
        };
        bind();
        a.onstatechange = bind;
      })
      .catch(() => setStatus("permission denied"));
    return () => {
      cancelled = true;
      if (access) for (const input of access.inputs.values()) input.onmidimessage = null;
    };
  }, []);

  return (
    <div className="midimon" style={{ width: w, height: h }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="midimon-head">
        <span>{status}</span>
        <button className="midimon-clear" onClick={() => setLines([])} title="Clear the log">
          clear
        </button>
      </div>
      <div className="midimon-log">
        {lines.length === 0 ? (
          <div className="midimon-empty">waiting for MIDI…</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="midimon-line">
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
