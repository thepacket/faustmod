import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Monitors } from "../../audio/monitors";
import type { TableMonitor } from "../../audio/tableUnits";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Shared plumbing for the drawable widgets (envelope, wavetable, curve, multislider,
 * grids). Handles the three things every one of them needs and none of them should
 * re-solve: a DPR-correct canvas sized to the node body, pointer drags converted to
 * normalized 0..1 coordinates (canvas-space, so editor zoom cancels out), and
 * persistence of the drawn state into the patch.
 */

/** A point in normalized canvas space: x 0..1 left→right, y 0..1 bottom→top. */
export interface Pt {
  x: number;
  y: number;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Read/write a widget's persisted state. Values live on `node.widgetState`, which the
 * editor serializes into the patch node's `state`, so drawn shapes survive save/reload.
 * Returns a getter (fresh each call) and a setter that also marks the patch dirty.
 */
export function usePersistedState<T>(node: WidgetNode, key: string, initial: () => T) {
  if (node.widgetState[key] === undefined) node.widgetState[key] = initial();
  const get = useCallback(() => node.widgetState[key] as T, [node, key]);
  const set = useCallback(
    (value: T) => {
      node.widgetState[key] = value;
      WidgetBridge.onChange();
    },
    [node, key],
  );
  return [get, set] as const;
}

/**
 * Rasterize breakpoints (sorted by x, in normalized space) into a lookup table.
 * `curve` bends each segment: 0 = linear, >0 = ease-out, <0 = ease-in.
 */
export function rasterize(points: Pt[], size = 512, curve = 0): Float32Array {
  const table = new Float32Array(size);
  if (points.length === 0) return table;
  const pts = [...points].sort((a, b) => a.x - b.x);
  let seg = 0;
  for (let i = 0; i < size; i++) {
    const x = i / (size - 1);
    while (seg < pts.length - 2 && x > pts[seg + 1].x) seg++;
    const a = pts[Math.min(seg, pts.length - 1)];
    const b = pts[Math.min(seg + 1, pts.length - 1)];
    const span = b.x - a.x;
    let t = span <= 0 ? 0 : clamp01((x - a.x) / span);
    if (curve !== 0) t = curve > 0 ? Math.pow(t, 1 / (1 + curve * 3)) : Math.pow(t, 1 - curve * 3);
    table[i] = a.y + (b.y - a.y) * t;
  }
  return table;
}

/** Push a table to this node's running unit (no-op when the graph isn't built). */
export function pushTable(nodeId: string, table: Float32Array) {
  const m = Monitors.get(nodeId) as TableMonitor | undefined;
  if (m?.setTable) m.setTable(table);
}

/**
 * Push control values straight to the running unit. Momentary widgets (pads, dice) must
 * call this the instant they fire: waiting for the next poll can miss a short pulse
 * entirely if the browser throttles timers.
 */
export function pushValues(nodeId: string, values: number[]) {
  const m = Monitors.get(nodeId) as { setValues?(v: number[]): void } | undefined;
  m?.setValues?.(values);
}

/**
 * Keep the running unit in sync with a drawn shape: pushes on mount, whenever `deps`
 * change, and periodically while the graph may still be starting up (a widget can be
 * drawn before Start, so the unit appears later and needs the shape resent once).
 */
export function useTableSync(nodeId: string, build: () => Float32Array, deps: unknown[]) {
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    let seen: unknown = null;
    const send = () => {
      const m = Monitors.get(nodeId);
      if (!m) {
        seen = null;
        return;
      }
      if (m !== seen) {
        seen = m;
        pushTable(nodeId, buildRef.current());
      }
    };
    pushTable(nodeId, buildRef.current());
    send();
    const timer = window.setInterval(send, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, ...deps]);
}

/**
 * Measure the element a widget body is placed in, so a canvas can fill it exactly.
 * Needed because a node's height is set by its port stack (16 outputs make a tall node),
 * which the widget can't know up front — a fixed-size canvas would leave dead space.
 * The canvas must be positioned absolutely inside the returned ref, or it would inflate
 * the box it is measuring.
 */
export function useFilledSize(fallback: { w: number; h: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Divide out the editor zoom so the backing store matches CSS pixels.
      const zoom = WidgetBridge.zoom() || 1;
      const w = Math.max(20, Math.round(r.width / zoom));
      const h = Math.max(20, Math.round(r.height / zoom));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

interface DrawCanvasProps {
  width: number;
  height: number;
  className?: string;
  /** Paint the widget. Called on every animation frame the canvas is dirty. */
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Pointer went down at a normalized position (y is bottom-up). */
  onDown?: (p: Pt, e: ReactPointerEvent) => void;
  /** Pointer moved while held (only fires after onDown on this canvas). */
  onDrag?: (p: Pt, e: PointerEvent) => void;
  onUp?: () => void;
  /** Double-click at a normalized position (pointerdown carries no click count). */
  onDoublePt?: (p: Pt) => void;
  /** Repaint trigger — bump when the drawn data changes. */
  revision?: unknown;
  title?: string;
}

/**
 * Canvas that repaints on demand and reports pointer positions in normalized space.
 * Pointer events are stopped from reaching the node so dragging edits the shape
 * instead of moving the node around the canvas.
 */
export function DrawCanvas({
  width,
  height,
  className,
  draw,
  onDown,
  onDrag,
  onUp,
  onDoublePt,
  revision,
  title,
}: DrawCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  // The pointermove/up listeners are registered once per press, so they must call the
  // LATEST handlers — otherwise every move edits the state as it was at pointer-down
  // and each new segment throws away the previous one.
  const handlers = useRef({ onDown, onDrag, onUp });
  handlers.current = { onDown, onDrag, onUp };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawRef.current(ctx, width, height);
  }, [width, height, revision]);

  // Client coords → normalized canvas space. Using the canvas' own bounding box means
  // the editor's zoom transform is already accounted for.
  const toNorm = (clientX: number, clientY: number): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: clamp01(r.width ? (clientX - r.left) / r.width : 0),
      y: clamp01(r.height ? 1 - (clientY - r.top) / r.height : 0),
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    handlers.current.onDown?.(toNorm(e.clientX, e.clientY), e);
    const move = (ev: PointerEvent) =>
      handlers.current.onDrag?.(toNorm(ev.clientX, ev.clientY), ev);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      handlers.current.onUp?.();
      WidgetBridge.onChange();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "draw-canvas"}
      style={{ width, height }}
      title={title}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoublePt?.(toNorm(e.clientX, e.clientY));
      }}
      // Right-drag edits the shape; the canvas' own context menu would interrupt it.
      onContextMenu={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    />
  );
}
