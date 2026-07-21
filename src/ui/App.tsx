import { useEffect, useRef, useState } from "react";
import { createEditor, type EditorHandle } from "../editor/createEditor";
import { LibraryService } from "../components/LibraryService";
import { AudioGraph } from "../audio/AudioGraph";
import { AudioEngine } from "../audio/AudioEngine";
import { Toolbar } from "./Toolbar";
import { LibraryPanel } from "./LibraryPanel";
import { AiPanel } from "./AiPanel";
import { SettingsModal } from "./SettingsModal";

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [playing, setPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let disposed = false;
    let handle: EditorHandle | null = null;

    (async () => {
      await LibraryService.init();
      if (disposed || !canvasRef.current) return;
      handle = await createEditor(canvasRef.current);
      if (disposed) {
        handle.destroy();
        return;
      }
      editorRef.current = handle;
      AudioGraph.onNodeError = (msg) => setStatus(msg);
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).editor = handle;
      }
      setReady(true);
      setStatus(`${LibraryService.components.length} components`);
    })();

    return () => {
      disposed = true;
      handle?.destroy();
      void AudioGraph.stop();
    };
  }, []);

  const togglePlay = async () => {
    try {
      if (playing) {
        await AudioGraph.stop();
        setPlaying(false);
        setStatus("Stopped");
      } else {
        const errors = await AudioGraph.start();
        setPlaying(true);
        setStatus(
          errors.length
            ? `⚠ ${errors.length} node(s) failed — ${errors[0]}`
            : "Playing",
        );
      }
    } catch (err) {
      setStatus(`Audio error: ${(err as Error).message}`);
    }
  };

  return (
    <div className="app">
      <Toolbar
        playing={playing}
        onTogglePlay={togglePlay}
        onMasterVolume={(v) => AudioEngine.setMasterVolume(v)}
        onClear={() => editorRef.current?.clear()}
        onFit={() => editorRef.current?.zoomToFit()}
        onSettings={() => setShowSettings(true)}
        status={status}
      />
      <div className="body">
        <LibraryPanel
          disabled={!ready}
          onAdd={(def) => editorRef.current?.addComponent(def)}
        />
        <div className="canvas" ref={canvasRef} />
        <AiPanel
          disabled={!ready}
          onGenerated={async (snap) => {
            await editorRef.current?.load(snap);
            setStatus("Patch generated");
          }}
          setStatus={setStatus}
        />
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
