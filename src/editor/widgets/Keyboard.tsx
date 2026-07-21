import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors, type GateFreqMonitor } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK: Record<number, number> = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 }; // whiteIndex -> semitone
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Computer-key -> semitone offset (A..K row = one octave)
const KEYMAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12,
};
const OCTAVES = 2;

export function Keyboard({ node }: { node: WidgetNode }) {
  const [octave, setOctave] = useState(Number(node.widgetState.octave ?? 4));
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const hot = useRef(false);
  const octaveRef = useRef(octave);
  octaveRef.current = octave;

  const unit = () => Monitors.get(node.id) as GateFreqMonitor | undefined;

  const down = (midi: number) => {
    unit()?.noteOn(midi, 100);
    setPressed((p) => (p.has(midi) ? p : new Set(p).add(midi)));
  };
  const up = (midi: number) => {
    unit()?.noteOff(midi);
    setPressed((p) => {
      if (!p.has(midi)) return p;
      const n = new Set(p);
      n.delete(midi);
      return n;
    });
  };

  // Computer keyboard while hovering the widget.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (!hot.current || e.repeat) return;
      const off = KEYMAP[e.key.toLowerCase()];
      if (off === undefined) return;
      down(octaveRef.current * 12 + off);
    };
    const ku = (e: KeyboardEvent) => {
      const off = KEYMAP[e.key.toLowerCase()];
      if (off === undefined) return;
      up(octaveRef.current * 12 + off);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [node.id]);

  const setOct = (o: number) => {
    const v = Math.max(0, Math.min(8, o));
    setOctave(v);
    node.widgetState.octave = v;
    WidgetBridge.onChange();
  };

  const keys: { midi: number; black: boolean; left: number }[] = [];
  let x = 0;
  const W = 16;
  for (let oc = 0; oc < OCTAVES; oc++) {
    for (let wi = 0; wi < 7; wi++) {
      const base = (octave + oc) * 12 + WHITE[wi];
      keys.push({ midi: base, black: false, left: x });
      if (BLACK[wi] !== undefined) {
        keys.push({ midi: (octave + oc) * 12 + BLACK[wi], black: true, left: x + W * 0.65 });
      }
      x += W;
    }
  }
  const width = OCTAVES * 7 * W;

  const handlers = (midi: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      down(midi);
    },
    onPointerUp: (e: PointerEvent) => {
      e.stopPropagation();
      up(midi);
    },
    onPointerLeave: () => up(midi),
  });

  return (
    <div
      className="kbd"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => (hot.current = true)}
      onPointerLeave={() => (hot.current = false)}
    >
      <div className="kbd-bar">
        <button className="kbd-oct" onPointerDown={(e) => { e.stopPropagation(); setOct(octave - 1); }}>
          −
        </button>
        <span className="kbd-label">C{octave}</span>
        <button className="kbd-oct" onPointerDown={(e) => { e.stopPropagation(); setOct(octave + 1); }}>
          +
        </button>
      </div>
      <div className="kbd-keys" style={{ width, height: 56 }}>
        {keys
          .filter((k) => !k.black)
          .map((k) => (
            <div
              key={k.midi}
              className={`kbd-white ${pressed.has(k.midi) ? "on" : ""}`}
              style={{ left: k.left, width: W }}
              {...handlers(k.midi)}
              title={`${NAMES[k.midi % 12]}${Math.floor(k.midi / 12) - 1}`}
            />
          ))}
        {keys
          .filter((k) => k.black)
          .map((k) => (
            <div
              key={k.midi}
              className={`kbd-black ${pressed.has(k.midi) ? "on" : ""}`}
              style={{ left: k.left, width: W * 0.7 }}
              {...handlers(k.midi)}
              title={`${NAMES[k.midi % 12]}${Math.floor(k.midi / 12) - 1}`}
            />
          ))}
      </div>
    </div>
  );
}
