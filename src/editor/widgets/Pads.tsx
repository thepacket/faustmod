import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { MultiCVMonitor } from "../../audio/tableUnits";
import { pushValues } from "./DrawCanvas";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const MIN_MS = 60; // floor on a tap, so a quick click still reads as a gate downstream

/**
 * Pad bank: eight gates you can play by hand (or with the number keys while the pad has
 * focus). Each pad is its own output and stays high for as long as you hold it — a tap
 * is floored at MIN_MS so downstream envelopes always see it.
 */
export function Pads({ node }: { node: WidgetNode }) {
  const count = Number(node.widgetConfig?.pads ?? 8);
  const [lit, setLit] = useState<number[]>([]);
  const values = useRef<number[]>(new Array(count).fill(0));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as MultiCVMonitor | undefined;
      m?.setValues?.(values.current);
    }, 20);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const set = (i: number, on: boolean) => {
    values.current = values.current.map((v, k) => (k === i ? (on ? 1 : 0) : v));
    pushValues(node.id, values.current); // don't wait for the poll: taps are short
    setLit((l) => (on ? [...l, i] : l.filter((x) => x !== i)));
  };

  /** Press: gate high until release, but never shorter than MIN_MS. */
  const press = (i: number) => {
    const down = performance.now();
    set(i, true);
    const release = () => {
      window.removeEventListener("pointerup", release);
      const held = performance.now() - down;
      window.setTimeout(() => set(i, false), Math.max(0, MIN_MS - held));
      WidgetBridge.onChange();
    };
    window.addEventListener("pointerup", release);
  };

  /** Keyboard taps have no release event worth tracking — fire a fixed-length gate. */
  const tap = (i: number) => {
    set(i, true);
    window.setTimeout(() => set(i, false), MIN_MS);
  };

  return (
    <div
      className="pads"
      tabIndex={0}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= count) tap(n - 1);
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`pad${lit.includes(i) ? " on" : ""}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            press(i);
          }}
          title={`Pad ${i + 1} (key ${i + 1})`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
