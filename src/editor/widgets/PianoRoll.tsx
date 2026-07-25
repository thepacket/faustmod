import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { PatternMonitor } from "../../audio/seqUnits";
import { DrawCanvas, clamp01, usePersistedState, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const LOW_MIDI = 48; // C3 at the bottom of the roll
const ROWS = 25; // two octaves + 1
const BLACK = [1, 3, 6, 8, 10];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYS_W = 22; // keyboard gutter on the left
const VEL_H = 26; // velocity lane along the bottom

interface Note {
  step: number;
  midi: number;
  len: number;
  vel: number;
}

const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

/**
 * A clip editor rather than a step row: notes have a pitch, a start step and a length,
 * so a phrase longer than a bar is one node instead of a chain of sequencers.
 *
 * The keyboard gutter on the left names the rows — without it you are counting
 * rectangles to find a pitch — and the lane along the bottom edits velocity, which the
 * node outputs and so must be settable.
 */
export function PianoRoll({ node }: { node: WidgetNode }) {
  const steps = Number(node.widgetConfig?.steps ?? 32);
  const w = node.width ?? 340;
  const h = node.height ?? 180;
  const [getNotes, setNotes] = usePersistedState<Note[]>(node, "notes", () => []);
  const [rev, bump] = useState(0);
  const drawing = useRef<Note | null>(null);
  const velTarget = useRef<Note | null>(null);
  const playhead = useRef(-1);

  const commit = (next: Note[]) => {
    setNotes(next);
    bump((n) => n + 1);
  };

  const notesRef = useRef(getNotes());
  notesRef.current = getNotes();
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

  // Geometry. DrawCanvas reports y bottom-up; the grid is easier to reason about
  // top-down, so convert once here.
  const gridW = w - KEYS_W;
  const gridH = h - VEL_H;
  const rowH = gridH / ROWS;
  const stepW = gridW / steps;
  const at = (p: Pt) => {
    const x = p.x * w;
    const y = (1 - p.y) * h;
    return {
      x,
      y,
      inKeys: x < KEYS_W,
      inVel: y > gridH,
      step: Math.min(steps - 1, Math.max(0, Math.floor((x - KEYS_W) / stepW))),
      midi: LOW_MIDI + Math.min(ROWS - 1, Math.max(0, ROWS - 1 - Math.floor(y / rowH))),
    };
  };

  const noteAt = (step: number, midi: number) =>
    getNotes().find((n) => n.midi === midi && step >= n.step && step < n.step + n.len);

  const onDown = (p: Pt) => {
    const { inKeys, inVel, step, midi } = at(p);
    if (inKeys) return; // the gutter is a ruler, not a target
    const live = getNotes();
    if (inVel) {
      // Grab the note starting nearest this column and set its velocity by dragging.
      const inColumn = live.filter((n) => step >= n.step && step < n.step + n.len);
      const target =
        inColumn.sort((a, b) => Math.abs(a.step - step) - Math.abs(b.step - step))[0] ?? null;
      velTarget.current = target;
      if (target) onDrag(p);
      return;
    }
    const hit = noteAt(step, midi);
    if (hit) {
      commit(live.filter((n) => n !== hit));
      return;
    }
    const note: Note = { step, midi, len: 1, vel: 0.8 };
    drawing.current = note;
    commit([...live, note]);
  };

  const onDrag = (p: Pt) => {
    const { y, step } = at(p);
    const target = velTarget.current;
    if (target) {
      const vel = clamp01(1 - (y - gridH) / VEL_H);
      commit(getNotes().map((n) => (n === target ? Object.assign(n, { vel }) : n)));
      return;
    }
    const note = drawing.current;
    if (!note) return;
    const len = Math.max(1, Math.min(steps - note.step, step - note.step + 1));
    if (len === note.len) return;
    commit(getNotes().map((n) => (n === note ? Object.assign(n, { len }) : n)));
  };

  return (
    <DrawCanvas
      className="draw-canvas roll-canvas"
      width={w}
      height={h}
      revision={rev}
      title="Piano roll — click places a note, drag right to lengthen, click again to remove. Drag in the bottom lane for velocity."
      onDown={onDown}
      onDrag={onDrag}
      onUp={() => {
        drawing.current = null;
        velTarget.current = null;
      }}
      draw={(ctx) => {
        const notes = getNotes();
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.fillRect(0, 0, w, h);

        // ---- keyboard gutter ----
        for (let r = 0; r < ROWS; r++) {
          const midi = LOW_MIDI + r;
          const black = BLACK.includes(midi % 12);
          const y = gridH - (r + 1) * rowH;
          ctx.fillStyle = black ? "#16181e" : "#c8cdd8";
          ctx.fillRect(0, y, KEYS_W - 2, rowH - 0.5);
          if (midi % 12 === 0) {
            // Label each C, the only anchor you need to read the rest.
            ctx.fillStyle = "#4a5060";
            ctx.font = "7px ui-monospace, monospace";
            ctx.textAlign = "left";
            ctx.fillText(noteName(midi), 2, y + rowH - 1);
          }
        }

        // ---- grid ----
        for (let r = 0; r < ROWS; r++) {
          if (!BLACK.includes((LOW_MIDI + r) % 12)) continue;
          ctx.fillStyle = "rgba(255,255,255,0.035)";
          ctx.fillRect(KEYS_W, gridH - (r + 1) * rowH, gridW, rowH);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.beginPath();
        for (let s = 0; s <= steps; s += 4) {
          ctx.moveTo(KEYS_W + s * stepW, 0);
          ctx.lineTo(KEYS_W + s * stepW, gridH);
        }
        ctx.stroke();
        if (playhead.current >= 0) {
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(KEYS_W + playhead.current * stepW, 0, stepW, gridH);
        }

        // ---- notes (brightness tracks velocity) ----
        for (const n of notes) {
          const r = n.midi - LOW_MIDI;
          if (r < 0 || r >= ROWS) continue;
          ctx.fillStyle = `rgba(105,219,124,${(0.35 + 0.65 * n.vel).toFixed(2)})`;
          ctx.fillRect(
            KEYS_W + n.step * stepW + 1,
            gridH - (r + 1) * rowH + 1,
            n.len * stepW - 2,
            rowH - 2,
          );
        }

        // ---- velocity lane ----
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(KEYS_W, gridH, gridW, VEL_H);
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.moveTo(KEYS_W, gridH + 0.5);
        ctx.lineTo(w, gridH + 0.5);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.30)";
        ctx.font = "7px ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.fillText("vel", 2, gridH + 9);
        for (const n of notes) {
          const bh = Math.max(1, n.vel * (VEL_H - 4));
          const x = KEYS_W + n.step * stepW + 1;
          ctx.fillStyle = "#69db7c";
          ctx.fillRect(x, gridH + VEL_H - bh - 2, Math.max(2, stepW - 2), bh);
        }
      }}
    />
  );
}
