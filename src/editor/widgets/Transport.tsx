import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { PatternMonitor } from "../../audio/seqUnits";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Patch transport: generates the 16th-note clock the sequencing widgets run on, with
 * run/stop, reset and tap tempo. The BPM shown here drives the clock unless something
 * is wired into the bpm input.
 */
export function Transport({ node }: { node: WidgetNode }) {
  const stored = node.widgetState.bpm;
  const [bpm, setBpm] = useState(typeof stored === "number" ? stored : 120);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const taps = useRef<number[]>([]);

  const monitor = () => Monitors.get(node.id) as PatternMonitor | undefined;

  // The unit is rebuilt on every Start, so re-send bpm/run and poll the step counter.
  useEffect(() => {
    let seen: unknown = null;
    const tick = () => {
      const m = monitor();
      if (!m) {
        seen = null;
        if (step !== -1) setStep(-1);
        return;
      }
      if (m !== seen) {
        seen = m;
        m.setRunning?.(running);
      }
      m.setInputDefault?.(1, bpm);
      const p = m.position();
      if (p !== step) setStep(p);
    };
    const timer = window.setInterval(tick, 50);
    return () => window.clearInterval(timer);
  }, [node.id, bpm, running, step]);

  const applyBpm = (v: number) => {
    const clamped = Math.max(20, Math.min(300, Math.round(v)));
    setBpm(clamped);
    node.widgetState.bpm = clamped;
    WidgetBridge.onChange();
  };

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      applyBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  };

  const toggle = () => {
    const next = !running;
    setRunning(next);
    monitor()?.setRunning?.(next);
  };

  return (
    <div className="transport" onPointerDown={(e) => e.stopPropagation()}>
      <div className="transport-row">
        <button className={`tp-btn${running ? " on" : ""}`} onClick={toggle} title="Run / stop">
          {running ? "◼" : "▶"}
        </button>
        <button
          className="tp-btn"
          onClick={() => {
            monitor()?.setPattern({ reset: true });
            setStep(-1);
          }}
          title="Reset to step 1"
        >
          ⟲
        </button>
        <input
          className="tp-bpm"
          type="number"
          min={20}
          max={300}
          value={bpm}
          onChange={(e) => applyBpm(Number(e.target.value))}
          title="Tempo (BPM)"
        />
        <button className="tp-btn wide" onClick={tap} title="Tap tempo">
          TAP
        </button>
      </div>
      <div className="tp-steps">
        {Array.from({ length: 16 }, (_, i) => (
          <span key={i} className={`tp-dot${step % 16 === i ? " on" : ""}${i % 4 === 0 ? " beat" : ""}`} />
        ))}
      </div>
    </div>
  );
}
