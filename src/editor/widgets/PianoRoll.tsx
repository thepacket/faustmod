import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { PatternMonitor } from "../../audio/seqUnits";
import { DrawCanvas, usePersistedState, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const LOW_MIDI = 48; // C3 at the bottom of the roll
const ROWS = 25; // two octaves + 1
const BLACK = [1, 3, 6, 8, 10];

interface Note {
  step: number;
  midi: number;
  len: number;
  vel: number;
}

/**
 * A clip editor rather than a step row: notes have a pitch, a start step and a length,
 * so a phrase longer than a bar is one node instead of a chain of sequencers. Click to
 * place a note, drag right to lengthen, click an existing note to remove it.
 */
export function PianoRoll({ node }: { node: WidgetNode }) {
  const steps = Number(node.widgetConfig?.steps ?? 32);
  const w = node.width ?? 320;
  const h = node.height ?? 160;
  const [getNotes, setNotes] = usePersistedState<Note[]>(node, "notes", () => []);
  const [rev, bump] = useState(0);
  const drawing = useRef<Note | null>(null);
  const playhead = useRef(-1);

  const notes = getNotes();
  const commit = (next: Note[]) => {
    setNotes(next);
    bump((n) => n + 1);
  };

  const notesRef = useRef(notes);
  notesRef.current = notes;
  useEffect(() => {
    let sent: unknown = null;
    const tick = () => {
      const m = Monitors.get(node.id) as PatternMonitor | undefined;
      if (!m?.setPattern) {
        sent = null;
        return;
      }
      if (sent !== notesRef.current) {
        m.setPattern({ notes: notesRef.current.map((n) => ({ ...n })), steps });
        sent = notesRef.current;
      }
      const p = m.position();
      if (p !== playhead.current) {
        playhead.current = p;
        bump((n) => n + 1);
      }
    };
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [node.id, steps, rev]);

  const at = (p: Pt) => ({
    step: Math.min(steps - 1, Math.max(0, Math.floor(p.x * steps))),
    midi: LOW_MIDI + Math.min(ROWS - 1, Math.max(0, Math.floor(p.y * ROWS))),
  });

  const onDown = (p: Pt) => {
    const { step, midi } = at(p);
    const hit = notes.find((n) => n.midi === midi && step >= n.step && step < n.step + n.len);
    if (hit) {
      commit(notes.filter((n) => n !== hit));
      return;
    }
    const note: Note = { step, midi, len: 1, vel: 1 };
    drawing.current = note;
    commit([...notes, note]);
  };

  const onDrag = (p: Pt) => {
    const note = drawing.current;
    if (!note) return;
    const { step } = at(p);
    const len = Math.max(1, Math.min(steps - note.step, step - note.step + 1));
    if (len === note.len) return;
    commit(notes.map((n) => (n === note ? Object.assign(n, { len }) : n)));
  };

  return (
    <DrawCanvas
      className="draw-canvas roll-canvas"
      width={w}
      height={h}
      revision={rev}
      title="Piano roll — click places a note, drag right to lengthen, click again to remove"
      onDown={onDown}
      onDrag={onDrag}
      onUp={() => (drawing.current = null)}
      draw={(ctx, cw, ch) => {
        const bw = cw / steps;
        const bh = ch / ROWS;
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(0, 0, cw, ch);
        // Black-key rows shaded, so pitches are readable at a glance.
        for (let r = 0; r < ROWS; r++) {
          if (!BLACK.includes((LOW_MIDI + r) % 12)) continue;
          ctx.fillStyle = "rgba(255,255,255,0.035)";
          ctx.fillRect(0, ch - (r + 1) * bh, cw, bh);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        for (let s = 0; s <= steps; s += 4) {
          ctx.moveTo(s * bw, 0);
          ctx.lineTo(s * bw, ch);
        }
        ctx.stroke();
        if (playhead.current >= 0) {
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(playhead.current * bw, 0, bw, ch);
        }
        for (const n of notes) {
          const r = n.midi - LOW_MIDI;
          if (r < 0 || r >= ROWS) continue;
          ctx.fillStyle = "#69db7c";
          ctx.fillRect(n.step * bw + 1, ch - (r + 1) * bh + 1, n.len * bw - 2, bh - 2);
        }
      }}
    />
  );
}
