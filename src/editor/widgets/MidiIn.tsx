import { useEffect, useState } from "react";
import { Monitors, type GateFreqMonitor } from "../../audio/monitors";
import type { WidgetNode } from "./WidgetBridge";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

interface MidiInput {
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}
interface MidiAccess {
  inputs: Map<string, MidiInput>;
  onstatechange: (() => void) | null;
}

export function MidiIn({ node }: { node: WidgetNode }) {
  const [status, setStatus] = useState("connecting…");
  const [last, setLast] = useState("—");

  useEffect(() => {
    let access: MidiAccess | null = null;
    let cancelled = false;

    const onMsg = (e: { data: Uint8Array }) => {
      const [s, d1, d2] = e.data;
      const cmd = s & 0xf0;
      const u = Monitors.get(node.id) as GateFreqMonitor | undefined;
      if (cmd === 0x90 && d2 > 0) {
        u?.noteOn(d1, d2);
        setLast(noteName(d1));
      } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
        u?.noteOff(d1);
      }
    };

    const req = (navigator as unknown as { requestMIDIAccess?: () => Promise<MidiAccess> })
      .requestMIDIAccess;
    if (!req) {
      setStatus("Web MIDI not supported");
      return;
    }
    req.call(navigator).then(
      (a) => {
        if (cancelled) return;
        access = a;
        const attach = () => {
          let n = 0;
          a.inputs.forEach((i) => {
            i.onmidimessage = onMsg;
            n++;
          });
          setStatus(n ? `${n} device${n > 1 ? "s" : ""}` : "no devices");
        };
        attach();
        a.onstatechange = attach;
      },
      () => setStatus("permission denied"),
    );

    return () => {
      cancelled = true;
      access?.inputs.forEach((i) => (i.onmidimessage = null));
    };
  }, [node.id]);

  return (
    <div className="midi">
      <div className="midi-status">🎹 {status}</div>
      <div className="midi-note">{last}</div>
    </div>
  );
}
