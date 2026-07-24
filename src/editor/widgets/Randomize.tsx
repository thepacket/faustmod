import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { MultiCVMonitor } from "../../audio/tableUnits";
import { pushValues } from "./DrawCanvas";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

const PULSE_MS = 40;

/**
 * Dice: one click rolls a fresh random value and fires a trigger alongside it, so a
 * patch can be re-seeded on demand — the "surprise me" button every modular has.
 */
export function Randomize({ node }: { node: WidgetNode }) {
  const [value, setValue] = useState(Number(node.widgetState.value ?? 0.5));
  const state = useRef<number[]>([value, 0]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as MultiCVMonitor | undefined;
      m?.setValues?.(state.current);
    }, 20);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const roll = () => {
    const v = Math.random();
    state.current = [v, 1];
    pushValues(node.id, state.current); // the trigger is 40 ms — push it now
    setValue(v);
    node.widgetState.value = v;
    window.setTimeout(() => {
      state.current = [v, 0];
      pushValues(node.id, state.current);
    }, PULSE_MS);
    WidgetBridge.onChange();
  };

  return (
    <div className="dice" onPointerDown={(e) => e.stopPropagation()}>
      <button className="dice-btn" onClick={roll} title="Roll a new random value and fire a trigger">
        ⚄
      </button>
      <span className="dice-val">{value.toFixed(3)}</span>
    </div>
  );
}
