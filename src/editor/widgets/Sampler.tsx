import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors, type SamplerMonitor } from "../../audio/monitors";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/**
 * Sample player: pick an audio file (decoded once, kept in memory — not saved into
 * the patch), then a rising edge on the `trig` input plays it. The decoded channels
 * are re-pushed to the audio unit whenever it (re)appears after Start.
 */
export function Sampler({ node }: { node: WidgetNode }) {
  const [name, setName] = useState<string>((node.widgetState.sampleName as string) ?? "");
  const [status, setStatus] = useState<string>("");
  // Decoded channel data + source sample rate, held for re-push on unit recreation.
  const bufRef = useRef<{ channels: Float32Array[]; sr: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Push the buffer to the running unit when it appears (and it hasn't got one yet).
  useEffect(() => {
    const timer = window.setInterval(() => {
      const u = Monitors.get(node.id) as SamplerMonitor | undefined;
      if (u && bufRef.current && !u.hasBuffer()) {
        u.loadBuffer(bufRef.current.channels, bufRef.current.sr);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [node.id]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("decoding…");
    try {
      const bytes = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buf = await ctx.decodeAudioData(bytes);
      const channels: Float32Array[] = [];
      for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
        channels.push(buf.getChannelData(c).slice());
      }
      await ctx.close();
      bufRef.current = { channels, sr: buf.sampleRate };
      setName(file.name);
      node.widgetState.sampleName = file.name;
      setStatus(`${buf.duration.toFixed(2)}s · ${buf.numberOfChannels}ch`);
      // Push immediately if a unit is already live.
      const u = Monitors.get(node.id) as SamplerMonitor | undefined;
      u?.loadBuffer(channels, buf.sampleRate);
      WidgetBridge.onChange();
    } catch (err) {
      setStatus("decode failed");
      console.warn("Sample decode failed:", err);
    }
  };

  const stop = (e: PointerEvent) => e.stopPropagation();

  return (
    <div className="sampler" onPointerDown={stop}>
      <button className="sampler-load" onClick={() => fileRef.current?.click()}>
        {name ? "♪ " + name : "Load audio file…"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={onPick}
      />
      <div className="sampler-status">{status || "trig ▸ play · rate ▸ speed"}</div>
    </div>
  );
}
