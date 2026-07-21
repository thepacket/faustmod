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
  const initial =
    (node.widgetState.notes as number[] | undefined) ??
    Array.from({ length: steps }, (_, i) => C_MAJOR[i % C_MAJOR.length]);

  const [notes, setNotes] = useState<number[]>(initial);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const stepsRef = useRef<HTMLDivElement>(null);

  // Poll the running unit: push note frequencies and move the step highlight
  // imperatively (avoids re-rendering the whole grid every frame).
  useEffect(() => {
    let lastStep = -1;
    let lastMonitor: SeqMonitor | null = null;
    let pushedFor: number[] | null = null;
    const tick = () => {
      const m = Monitors.get(node.id) as SeqMonitor | undefined;
      let cur = -1;
      if (m) {
        if (m !== lastMonitor || notesRef.current !== pushedFor) {
          m.setFrequencies(notesRef.current.map(midiToHz));
          lastMonitor = m;
          pushedFor = notesRef.current;
        }
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
    const move = (ev: globalThis.PointerEvent) => {
      const m = Math.max(MIN, Math.min(MAX, startMidi + Math.round((startY - ev.clientY) / 4)));
      setNotes((prev) => {
        if (prev[i] === m) return prev;
        const next = prev.slice();
        next[i] = m;
        notesRef.current = next;
        node.widgetState.notes = next;
        return next;
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
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
          return (
            <div
              key={i}
              className="seq-step"
              onPointerDown={onStepDown(i)}
              title={`Step ${i + 1}: ${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1} — drag to change`}
            >
              <div className="seq-bar" style={{ height: `${(t * 100).toFixed(0)}%` }} />
              <span className="seq-note">{NOTE_NAMES[m % 12]}</span>
            </div>
          );
        })}
      </div>
      <div className="seq-hint">clock ▸ freq · drag steps to set pitch</div>
    </div>
  );
}
