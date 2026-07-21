import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors, type SeqMonitor } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MIN = 36; // C2
const MAX = 84; // C6
const C_MAJOR = [60, 62, 64, 65, 67, 69, 71, 72];

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export function Sequencer({ node }: { node: WidgetNode }) {
  const steps = Number(node.widgetConfig?.steps ?? 8);
  const initNotes =
    (node.widgetState.notes as number[] | undefined) ??
    Array.from({ length: steps }, (_, i) => C_MAJOR[i % C_MAJOR.length]);
  const initGates =
    (node.widgetState.gates as boolean[] | undefined) ?? Array.from({ length: steps }, () => true);
  const initVels =
    (node.widgetState.vels as number[] | undefined) ?? Array.from({ length: steps }, () => 1);

  const [notes, setNotes] = useState<number[]>(initNotes);
  const [gates, setGates] = useState<boolean[]>(initGates);
  const [vels, setVels] = useState<number[]>(initVels);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const gatesRef = useRef(gates);
  gatesRef.current = gates;
  const velsRef = useRef(vels);
  velsRef.current = vels;
  const stepsRef = useRef<HTMLDivElement>(null);

  // Poll the running unit: push per-step data and move the step highlight
  // imperatively (avoids re-rendering the whole grid every frame).
  useEffect(() => {
    let lastStep = -1;
    let lastMonitor: SeqMonitor | null = null;
    let pushedNotes: number[] | null = null;
    let pushedGates: boolean[] | null = null;
    let pushedVels: number[] | null = null;
    const tick = () => {
      const m = Monitors.get(node.id) as SeqMonitor | undefined;
      let cur = -1;
      if (m) {
        if (m !== lastMonitor || notesRef.current !== pushedNotes) {
          m.setFrequencies(notesRef.current.map(midiToHz));
          pushedNotes = notesRef.current;
        }
        if (m !== lastMonitor || gatesRef.current !== pushedGates) {
          m.setGates(gatesRef.current);
          pushedGates = gatesRef.current;
        }
        if (m !== lastMonitor || velsRef.current !== pushedVels) {
          m.setVelocities(velsRef.current);
          pushedVels = velsRef.current;
        }
        lastMonitor = m;
        cur = m.currentStep();
      } else {
        lastMonitor = null;
      }
      if (cur !== lastStep) {
        const cells = stepsRef.current?.children;
        if (cells) {
          if (lastStep >= 0 && cells[lastStep]) cells[lastStep].classList.remove("active");
          if (cur >= 0 && cells[cur]) cells[cur].classList.add("active");
        }
        lastStep = cur;
      }
    };
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const onStepDown = (i: number) => (e: PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startY = e.clientY;
    const startMidi = notes[i];
    const startVel = velsRef.current[i];
    const velMode = e.shiftKey;
    let moved = false;
    const move = (ev: globalThis.PointerEvent) => {
      const dy = startY - ev.clientY;
      if (Math.abs(dy) > 3) moved = true;
      if (velMode) {
        const v = Math.max(0, Math.min(1, startVel + dy / 100));
        setVels((prev) => {
          if (prev[i] === v) return prev;
          const next = prev.slice();
          next[i] = v;
          velsRef.current = next;
          node.widgetState.vels = next;
          return next;
        });
      } else {
        const m = Math.max(MIN, Math.min(MAX, startMidi + Math.round(dy / 4)));
        setNotes((prev) => {
          if (prev[i] === m) return prev;
          const next = prev.slice();
          next[i] = m;
          notesRef.current = next;
          node.widgetState.notes = next;
          return next;
        });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // A click without a drag (and no shift) toggles the step's gate on/off.
      if (!moved && !velMode) {
        setGates((prev) => {
          const next = prev.slice();
          next[i] = !next[i];
          gatesRef.current = next;
          node.widgetState.gates = next;
          return next;
        });
      }
      WidgetBridge.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="seq" onPointerDown={(e) => e.stopPropagation()}>
      <div className="seq-steps" ref={stepsRef}>
        {notes.map((m, i) => {
          const t = (m - MIN) / (MAX - MIN);
          const on = gates[i] !== false;
          return (
            <div
              key={i}
              className={`seq-step${on ? "" : " muted"}`}
              onPointerDown={onStepDown(i)}
              title={`Step ${i + 1}: ${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}${
                on ? "" : " (muted)"
              } · vel ${(vels[i] ?? 1).toFixed(2)}\ndrag = pitch · shift-drag = velocity · click = mute`}
            >
              <div
                className="seq-bar"
                style={{ height: `${(t * 100).toFixed(0)}%`, opacity: 0.35 + 0.65 * (vels[i] ?? 1) }}
              />
              <span className="seq-note">{NOTE_NAMES[m % 12]}</span>
            </div>
          );
        })}
      </div>
      <div className="seq-hint">drag pitch · shift-drag vel · click mutes</div>
    </div>
  );
}
