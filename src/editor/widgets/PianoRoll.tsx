import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { PatternMonitor } from "../../audio/seqUnits";
import { DrawCanvas, clamp01, usePersistedState, type Pt } from "./DrawCanvas";
import type { WidgetNode } from "./WidgetBridge";

const LOW_MIDI = 48; // C3 at the bottom of the roll
const ROWS = 25; // two octaves + 1
const BLACK = [1, 3, 6, 8, 10];
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYS_W = 26; // keyboard gutter on the left
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
        // Real key geometry, matching the Keyboard widget: white keys run the full
        // depth of the gutter with a seam between adjacent ones, black keys sit on top
        // at 62% depth. Equal-height rows keep every key aligned with its grid row.
        const whiteGrad = ctx.createLinearGradient(0, 0, KEYS_W, 0);
        whiteGrad.addColorStop(0, "#f4f4f0");
        whiteGrad.addColorStop(1, "#d8d8d2");
        ctx.fillStyle = whiteGrad;
        ctx.fillRect(0, 0, KEYS_W, gridH);

        const rowTop = (r: number) => gridH - (r + 1) * rowH;
        // Seams between adjacent white keys (E|F and B|C have no black key between).
        ctx.strokeStyle = "rgba(11,12,16,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let r = 0; r < ROWS - 1; r++) {
          const s0 = (LOW_MIDI + r) % 12;
          const s1 = (LOW_MIDI + r + 1) % 12;
          if (BLACK.includes(s0) || BLACK.includes(s1)) continue;
          const y = rowTop(r);
          ctx.moveTo(0, y + 0.5);
          ctx.lineTo(KEYS_W, y + 0.5);
        }
        ctx.stroke();

        const blackGrad = ctx.createLinearGradient(0, 0, KEYS_W * 0.62, 0);
        blackGrad.addColorStop(0, "#2a2e37");
        blackGrad.addColorStop(1, "#111318");
        for (let r = 0; r < ROWS; r++) {
          const midi = LOW_MIDI + r;
          if (!BLACK.includes(midi % 12)) continue;
          ctx.fillStyle = blackGrad;
          ctx.fillRect(0, rowTop(r) + 0.5, KEYS_W * 0.62, rowH - 1);
        }

        // Label each C on its (white) key — the only anchor needed to read the rest.
        ctx.fillStyle = "#4a5060";
        ctx.font = "7px ui-monospace, monospace";
        ctx.textAlign = "right";
        for (let r = 0; r < ROWS; r++) {
          const midi = LOW_MIDI + r;
          if (midi % 12 !== 0) continue;
          ctx.fillText(noteName(midi), KEYS_W - 2, rowTop(r) + rowH - 1.5);
        }
        // Edge of the keyboard against the grid.
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.beginPath();
        ctx.moveTo(KEYS_W - 0.5, 0);
        ctx.lineTo(KEYS_W - 0.5, gridH);
        ctx.stroke();

        // ---- grid ----
        // Row boundaries are snapped to whole pixels so the shading and the dividers
        // land on the same lines (rowH is fractional at most node sizes).
        const rowY = (r: number) => Math.round(gridH - r * rowH);
        for (let r = 0; r < ROWS; r++) {
          if (!BLACK.includes((LOW_MIDI + r) % 12)) continue;
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(KEYS_W, rowY(r + 1), gridW, rowY(r) - rowY(r + 1));
        }
        // Row dividers: one per semitone, with the octave boundary (below each C) drawn
        // stronger so you can count octaves without reading the labels. Half-pixel
        // offsets keep them a crisp 1px.
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.16)";
        ctx.beginPath();
        for (let r = 0; r <= ROWS; r++) {
          if ((LOW_MIDI + r) % 12 === 0) continue; // octave lines drawn separately
          const y = rowY(r) + 0.5;
          ctx.moveTo(KEYS_W, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.34)";
        ctx.beginPath();
        for (let r = 0; r <= ROWS; r++) {
          if ((LOW_MIDI + r) % 12 !== 0) continue;
          const y = rowY(r) + 0.5;
          ctx.moveTo(KEYS_W, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();

        // Step dividers: every step faint, every beat (4 steps) stronger.
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          if (s % 4 === 0) continue;
          const x = Math.round(KEYS_W + s * stepW) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, gridH);
        }
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.beginPath();
        for (let s = 0; s <= steps; s += 4) {
          const x = Math.round(KEYS_W + s * stepW) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, gridH);
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
            rowY(r + 1) + 1,
            n.len * stepW - 2,
            rowY(r) - rowY(r + 1) - 1,
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
