import { useEffect, useRef, useState } from "react";
import { Monitors } from "../../audio/monitors";
import type { ConvolverMonitor } from "../../audio/fileUnits";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Convolution reverb: load an impulse response and the space it was recorded in becomes
 * the reverb. The decoded IR is kept in memory (not saved into the patch) and re-pushed
 * whenever the audio graph is rebuilt, the same way the Sample Player does it.
 */
export function IrLoader({ node }: { node: WidgetNode }) {
  const [name, setName] = useState<string>((node.widgetState.irName as string) ?? "");
  const [status, setStatus] = useState("");
  const [mix, setMix] = useState(Number(node.widgetState.mix ?? 0.3));
  const bufRef = useRef<AudioBuffer | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const u = Monitors.get(node.id) as ConvolverMonitor | undefined;
      if (!u) return;
      if (bufRef.current && !u.hasImpulse()) u.loadImpulse(bufRef.current);
      u.setMix(mix);
    }, 100);
    return () => window.clearInterval(timer);
  }, [node.id, mix]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("decoding…");
    try {
      const bytes = await file.arrayBuffer();
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buf = await ctx.decodeAudioData(bytes);
      await ctx.close();
      bufRef.current = buf;
      setName(file.name);
      node.widgetState.irName = file.name;
      setStatus(`${buf.duration.toFixed(2)}s · ${buf.numberOfChannels}ch`);
      (Monitors.get(node.id) as ConvolverMonitor | undefined)?.loadImpulse(buf);
      WidgetBridge.onChange();
    } catch (err) {
      setStatus("decode failed");
      console.warn("IR decode failed:", err);
    }
  };

  return (
    <div className="sampler" onPointerDown={(e) => e.stopPropagation()}>
      <button className="sampler-load" onClick={() => fileRef.current?.click()}>
        {name ? "♪ " + name : "Load impulse response…"}
      </button>
      <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={onPick} />
      <label className="ir-mix">
        mix
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={mix}
          onChange={(e) => {
            const v = Number(e.target.value);
            setMix(v);
            node.widgetState.mix = v;
          }}
        />
      </label>
      <div className="sampler-status">{status || "dry/wet convolution"}</div>
    </div>
  );
}
