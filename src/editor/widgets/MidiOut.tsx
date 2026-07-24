import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { ProbeMonitor } from "../../audio/tableUnits";
import type { WidgetNode } from "./WidgetBridge";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const hzToMidi = (hz: number) => Math.round(69 + 12 * Math.log2(Math.max(1, hz) / 440));

interface MidiOutput {
  name?: string;
  send(data: number[]): void;
}
interface MidiAccess {
  outputs: Map<string, MidiOutput>;
  onstatechange: (() => void) | null;
}

/**
 * Sends the patch's gate/freq to a hardware or virtual MIDI port. The gate and pitch are
 * read from the audio graph at control rate (~40 ms), which suits FaustMod's
 * composition-first workflow — this is the "print it out as MIDI" endpoint, not a
 * sample-accurate live-performance driver.
 */
export function MidiOut({ node }: { node: WidgetNode }) {
  const [ports, setPorts] = useState<{ id: string; name: string }[]>([]);
  const [portId, setPortId] = useState<string>((node.widgetState.portId as string) ?? "");
  const [status, setStatus] = useState("connecting…");
  const [last, setLast] = useState("—");
  const accessRef = useRef<MidiAccess | null>(null);
  const playing = useRef<number | null>(null);

  useEffect(() => {
    const req = (navigator as unknown as { requestMIDIAccess?: () => Promise<MidiAccess> })
      .requestMIDIAccess;
    if (!req) {
      setStatus("Web MIDI not supported");
      return;
    }
    let cancelled = false;
    req.call(navigator)
      .then((access) => {
        if (cancelled) return;
        accessRef.current = access;
        const list = () =>
          setPorts([...access.outputs.entries()].map(([id, o]) => ({ id, name: o.name ?? id })));
        list();
        access.onstatechange = list;
        setStatus(access.outputs.size ? "ready" : "no MIDI outputs");
      })
      .catch(() => setStatus("permission denied"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the gate/freq inputs and translate edges into note on/off.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as ProbeMonitor | undefined;
      const out = accessRef.current?.outputs.get(portId);
      if (!m?.level || !out) return;
      const on = m.level(0) > 0.5; // input 0 = gate, input 1 = freq
      const midi = hzToMidi(m.level(1));
      if (on && playing.current === null) {
        out.send([0x90, Math.max(0, Math.min(127, midi)), 100]);
        playing.current = midi;
        setLast(`${noteName(midi)} on`);
      } else if (!on && playing.current !== null) {
        out.send([0x80, Math.max(0, Math.min(127, playing.current)), 0]);
        setLast(`${noteName(playing.current)} off`);
        playing.current = null;
      }
    }, 40);
    return () => {
      const out = accessRef.current?.outputs.get(portId);
      if (playing.current !== null && out) out.send([0x80, playing.current, 0]);
      playing.current = null;
      window.clearInterval(timer);
    };
  }, [node.id, portId]);

  return (
    <div className="midiout" onPointerDown={(e) => e.stopPropagation()}>
      <select
        className="midiout-port"
        value={portId}
        onChange={(e) => {
          setPortId(e.target.value);
          node.widgetState.portId = e.target.value;
        }}
        title="MIDI output port"
      >
        <option value="">— port —</option>
        {ports.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="midiout-status">{portId ? last : status}</div>
    </div>
  );
}
