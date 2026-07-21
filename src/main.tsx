import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { AudioEngine } from "./audio/AudioEngine";
import { AudioGraph } from "./audio/AudioGraph";
import { FaustService } from "./audio/FaustService";
import { Monitors } from "./audio/monitors";
import "./ui/styles.css";

// Dev-only debug handle for inspecting the running audio graph from the console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).faustmod = {
    AudioEngine,
    AudioGraph,
    FaustService,
    Monitors,
  };
}

// StrictMode is intentionally omitted: its double-invoked effects race with the
// async rete editor bootstrap and would mount the canvas twice in development.
createRoot(document.getElementById("root")!).render(<App />);
