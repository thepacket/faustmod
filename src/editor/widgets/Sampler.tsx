import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Monitors, type SamplerMonitor } from "../../audio/monitors";
import { DrawCanvas, clamp01, type Pt } from "./DrawCanvas";
import { WidgetBridge, type WidgetNode } from "./WidgetBridge";

/** Peak envelope of the decoded audio, at the canvas' horizontal resolution. */
function peaks(channel: Float32Array, columns: number): number[] {
  const step = Math.max(1, Math.floor(channel.length / columns));
  return Array.from({ length: columns }, (_, i) => {
    let p = 0;
    for (let k = i * step; k < Math.min(channel.length, (i + 1) * step); k++) {
      const v = Math.abs(channel[k]);
      if (v > p) p = v;
    }
    return p;
  });
}

/**
 * Sample player: pick an audio file (decoded once, kept in memory — not saved into
 * the patch), then a rising edge on the `trig` input plays it. The decoded channels
 * are re-pushed to the audio unit whenever it (re)appears after Start.
 */
export function Sampler({ node }: { node: WidgetNode }) {
  const [name, setName] = useState<string>((node.widgetState.sampleName as string) ?? "");
  const [status, setStatus] = useState<string>("");
  const [wave, setWave] = useState<number[]>([]);
  const [region, setRegion] = useState<{ start: number; end: number; loop: boolean }>(
    (node.widgetState.region as { start: number; end: number; loop: boolean }) ?? {
      start: 0,
      end: 1,
      loop: false,
    },
  );
  const dragging = useRef<"start" | "end" | null>(null);
  // Decoded channel data + source sample rate, held for re-push on unit recreation.
  const bufRef = useRef<{ channels: Float32Array[]; sr: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Push the buffer to the running unit when it appears (and it hasn't got one yet),
  // and keep the playback region in sync with the markers.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const u = Monitors.get(node.id) as SamplerMonitor | undefined;
      if (!u) return;
      if (bufRef.current && !u.hasBuffer()) u.loadBuffer(bufRef.current.channels, bufRef.current.sr);
      u.setRegion?.(region.start, region.end, region.loop);
    }, 100);
    return () => window.clearInterval(timer);
  }, [node.id, region]);

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
      setWave(peaks(channels[0], 160));
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

  const commitRegion = (next: typeof region) => {
    setRegion(next);
    node.widgetState.region = next;
    WidgetBridge.onChange();
  };

  // Grab whichever marker is nearer, then drag it; the pair stays ordered.
  const onDown = (p: Pt) => {
    dragging.current =
      Math.abs(p.x - region.start) <= Math.abs(p.x - region.end) ? "start" : "end";
    onDrag(p);
  };
  const onDrag = (p: Pt) => {
    if (!dragging.current) return;
    const x = clamp01(p.x);
    commitRegion(
      dragging.current === "start"
        ? { ...region, start: Math.min(x, region.end - 0.01) }
        : { ...region, end: Math.max(x, region.start + 0.01) },
    );
  };
  const idleHint =
    node.widget === "granular" ? "grain cloud · wire pos/size/density" : "trig ▸ play · rate ▸ speed";

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
      {wave.length > 0 && node.widget === "sampler" && (
        <>
          <DrawCanvas
            className="draw-canvas sampler-wave"
            width={(node.width ?? 200) - 12}
            height={38}
            revision={region}
            title="Drag the markers to set the play region"
            onDown={onDown}
            onDrag={onDrag}
            onUp={() => (dragging.current = null)}
            draw={(ctx, cw, ch) => {
              ctx.fillStyle = "rgba(0,0,0,0.25)";
              ctx.fillRect(0, 0, cw, ch);
              // Region highlight first, so the waveform stays legible on top of it.
              ctx.fillStyle = "rgba(87,217,119,0.12)";
              ctx.fillRect(region.start * cw, 0, (region.end - region.start) * cw, ch);
              ctx.strokeStyle = "#57d977";
              ctx.lineWidth = 1;
              wave.forEach((v, i) => {
                const x = (i / wave.length) * cw;
                const half = (v * ch) / 2;
                ctx.beginPath();
                ctx.moveTo(x, ch / 2 - half);
                ctx.lineTo(x, ch / 2 + half);
                ctx.stroke();
              });
              ctx.strokeStyle = "#ffd21f";
              ctx.lineWidth = 1.5;
              for (const x of [region.start * cw, region.end * cw]) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, ch);
                ctx.stroke();
              }
            }}
          />
          <label className="sampler-loop">
            <input
              type="checkbox"
              checked={region.loop}
              onChange={(e) => commitRegion({ ...region, loop: e.target.checked })}
            />
            loop
          </label>
        </>
      )}
      <div className="sampler-status">{status || idleHint}</div>
    </div>
  );
}
