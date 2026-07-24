import { useEffect, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { LooperMonitor } from "../../audio/fileUnits";
import type { WidgetNode } from "./WidgetBridge";

type Mode = "idle" | "record" | "play" | "overdub";

/**
 * Loop recorder: capture a phrase, then let it cycle while you layer on top. The first
 * pass defines the loop length; overdub sums into what's already there.
 */
export function Looper({ node }: { node: WidgetNode }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const m = Monitors.get(node.id) as LooperMonitor | undefined;
      if (!m?.position) return;
      setPos(m.position());
      setLen(m.length());
    }, 60);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const set = (next: Mode) => {
    setMode(next);
    (Monitors.get(node.id) as LooperMonitor | undefined)?.setMode?.(next);
  };

  return (
    <div className="looper" onPointerDown={(e) => e.stopPropagation()}>
      <div className="looper-row">
        {(["record", "play", "overdub"] as const).map((m) => (
          <button
            key={m}
            className={`looper-btn${mode === m ? " on" : ""}`}
            onClick={() => set(mode === m ? "idle" : m)}
            title={m}
          >
            {m === "record" ? "●" : m === "play" ? "▶" : "+"}
          </button>
        ))}
        <button
          className="looper-btn"
          onClick={() => {
            (Monitors.get(node.id) as LooperMonitor | undefined)?.clear?.();
            setMode("idle");
          }}
          title="Clear the loop"
        >
          ✕
        </button>
        <span className="looper-len">{len ? `${len.toFixed(1)}s` : "empty"}</span>
      </div>
      <div className="looper-bar">
        <div className="looper-play" style={{ left: `${(pos * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}
