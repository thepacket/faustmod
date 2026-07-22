import { useEffect, useRef, useState } from "react";
import { createEditor, type EditorHandle } from "../editor/createEditor";
import { LibraryService } from "../components/LibraryService";
import { COMPONENT_DND_TYPE } from "../components/library";
import { resolveComponent } from "../components/customBlocks";
import { AudioGraph } from "../audio/AudioGraph";
import { AudioEngine } from "../audio/AudioEngine";
import { PatchManager } from "../patch/PatchManager";
import { TabsManager, type TabInfo } from "../patch/TabsManager";
import { buildAiBrief } from "../patch/aiBrief";
import { MenuBar, type Menu } from "./MenuBar";
import { TabBar } from "./TabBar";
import { LibraryPanel } from "./LibraryPanel";
import { ModulePanel } from "./ModulePanel";
import { ImportBlockModal } from "./ImportBlockModal";
import { AboutModal } from "./AboutModal";
import { SettingsModal } from "./SettingsModal";
import { PresetModal } from "./PresetModal";
import { FaustEditor } from "./FaustEditor";
import { ModuleEditBridge } from "../editor/widgets/ModuleEditBridge";
import { RecordBridge } from "../editor/widgets/RecordBridge";
import { ContextMenuBridge, type ContextMenuTarget } from "../editor/widgets/ContextMenuBridge";
import { TooltipLayer } from "./TooltipLayer";
import { ContextMenu } from "./ContextMenu";
import { CustomBlocks } from "../components/customBlocks";
import { FaustService } from "../audio/FaustService";
import { derivePorts } from "../audio/faustIO";
import type { ComponentDef } from "../components/library";

type ModalKind = null | "about" | "import-block" | "settings" | "presets";
// The floating Faust editor targets one of: a placed canvas node, a saved user
// module (edits the stored library block), or an example (read-only view).
type EditTarget =
  | { kind: "node"; nodeId: string; title: string; code: string }
  | { kind: "user"; id: string; title: string; code: string }
  | { kind: "example"; title: string; code: string };

export function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorHandle | null>(null);
  const patchRef = useRef<PatchManager | null>(null);
  const tabsRef = useRef<TabsManager | null>(null);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Loading…");
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [patchName, setPatchName] = useState("Untitled");
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [nodeStyle, setNodeStyle] = useState<string>(
    () => localStorage.getItem("faustmod.nodeStyle") || "studio",
  );
  const setStyle = (s: string) => {
    localStorage.setItem("faustmod.nodeStyle", s);
    setNodeStyle(s);
  };
  const [modal, setModal] = useState<ModalKind>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuTarget | null>(null);

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

      // Double-clicking a module node opens the floating Faust source editor.
      ModuleEditBridge.open = (nodeId) => {
        const h = editorRef.current;
        if (!h) return;
        const code = h.getModuleCode(nodeId);
        if (code == null) return;
        setEditTarget({ kind: "node", nodeId, title: h.getNodeTitle(nodeId), code });
      };

      const mgr = new PatchManager(handle);
      const tabsMgr = new TabsManager(mgr);
      mgr.onChange = () => {
        setPatchName(mgr.name);
        tabsMgr.syncActive();
      };
      tabsMgr.onChange = () => {
        setTabs(tabsMgr.list());
        setActiveTab(tabsMgr.activeIndex());
      };
      handle.setChangeListener(() => mgr.markDirty());
      patchRef.current = mgr;
      tabsRef.current = tabsMgr;
      setTabs(tabsMgr.list());
      await tabsMgr.init(); // seed the first patch (Audio Input + Stereo Output)

      AudioGraph.onNodeError = (msg) => setStatus(msg);
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).editor = handle;
      }
      setReady(true);
      setStatus("");
    })();

    return () => {
      disposed = true;
      handle?.destroy();
      if (AudioEngine.recording) void AudioEngine.stopRecording();
      void AudioGraph.stop();
    };
  }, []);

  const togglePlay = async () => {
    try {
      if (playing) {
        await stopRec(); // the run is over — stop (and save) any recording unconditionally
        await AudioGraph.stop();
        setPlaying(false);
        setStatus("Stopped");
      } else {
        const errors = await AudioGraph.start();
        setPlaying(true);
        // Don't show "Playing" — the Start/Stop button already conveys it (and it
        // read awkwardly as "Playing Master" next to the volume label).
        setStatus(errors.length ? `⚠ ${errors.length} node(s) failed — ${errors[0]}` : "");
      }
    } catch (err) {
      setStatus(`Audio error: ${(err as Error).message}`);
    }
  };

  const ed = () => editorRef.current;
  const pm = () => patchRef.current;
  const tb = () => tabsRef.current;

  // Recording can be driven from the Rec button or a Record node; track which so the
  // node never stops a recording the button started, and guard against overlap.
  const recSourceRef = useRef<null | "node" | "button">(null);
  const recBusyRef = useRef(false);

  const startRec = async (source: "node" | "button") => {
    if (AudioEngine.recording || recBusyRef.current) return;
    recBusyRef.current = true;
    try {
      recSourceRef.current = source;
      if (!AudioGraph.isLive) {
        await AudioGraph.start();
        setPlaying(true);
      }
      await AudioEngine.startRecording();
      setRecording(true);
      setStatus("● Recording…");
    } catch (err) {
      setStatus(`Recording error: ${(err as Error).message}`);
    } finally {
      recBusyRef.current = false;
    }
  };

  const stopRec = async () => {
    if (!AudioEngine.recording || recBusyRef.current) {
      setRecording(false);
      return;
    }
    recBusyRef.current = true;
    try {
      recSourceRef.current = null;
      const blob = await AudioEngine.stopRecording();
      setRecording(false);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${patchName || "recording"}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Recording saved");
    } catch (err) {
      setStatus(`Recording error: ${(err as Error).message}`);
    } finally {
      recBusyRef.current = false;
    }
  };

  const toggleRecord = () => void (recording ? stopRec() : startRec("button"));

  // Record node → recorder. Non-zero starts; 0 stops only what the node itself started.
  useEffect(() => {
    RecordBridge.set = (on: boolean) => {
      if (on) void startRec("node");
      else if (recSourceRef.current === "node") void stopRec();
    };
  });

  // Right-click contextual menu (canvas + input ports).
  useEffect(() => {
    ContextMenuBridge.open = (t) => setCtxMenu(t);
  }, []);

  const runAddSlider = (orientation: "v" | "h") => {
    const ed = editorRef.current;
    if (!ed || !ctxMenu) return;
    if (ctxMenu.nodeId && ctxMenu.inputKey) {
      void ed.addSliderForInput(ctxMenu.nodeId, ctxMenu.inputKey, orientation);
    } else {
      void ed.addSlider(orientation, ed.screenToWorld(ctxMenu.x, ctxMenu.y));
    }
  };

  const exportBrief = () => {
    const url = URL.createObjectURL(new Blob([buildAiBrief()], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "faustmod-catalog-for-ai.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Exported catalog for AI");
  };

  // Global keyboard shortcuts (rete handles ⌘Z/⌘Y on the canvas itself).
  useEffect(() => {
    if (!ready) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "s") {
        e.preventDefault();
        void (e.shiftKey ? pm()?.saveAs() : pm()?.save());
      } else if (mod && k === "o") {
        e.preventDefault();
        void tb()?.openFile();
      } else if (mod && k === "n") {
        e.preventDefault();
        void tb()?.newTab();
      } else if (!inField && mod && k === "d") {
        e.preventDefault();
        void ed()?.duplicateSelected();
      } else if (!inField && mod && k === "c") {
        e.preventDefault();
        ed()?.copySelection();
      } else if (!inField && mod && k === "v") {
        e.preventDefault();
        void ed()?.paste();
      } else if (!inField && mod && k === "a") {
        e.preventDefault();
        void ed()?.selectAll();
      } else if (!inField && (e.key === "Delete" || e.key === "Backspace")) {
        void ed()?.removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready]);

  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "New Tab", shortcut: "⌘N", onClick: () => void tb()?.newTab() },
        { label: "Open…", shortcut: "⌘O", onClick: () => void tb()?.openFile() },
        { label: "Presets…", onClick: () => setModal("presets") },
        { separator: true },
        { label: "Save", shortcut: "⌘S", onClick: () => void pm()?.save() },
        { label: "Save As…", shortcut: "⇧⌘S", onClick: () => void pm()?.saveAs() },
        { separator: true },
        { label: "Export a copy…", onClick: () => pm()?.export() },
        { label: "Export Catalog for AI…", onClick: () => exportBrief() },
        { separator: true },
        { label: "Settings…", onClick: () => setModal("settings") },
      ],
    },
    {
      label: "Edit",
      items: [
        { label: "Undo", shortcut: "⌘Z", onClick: () => ed()?.undo() },
        { label: "Redo", shortcut: "⇧⌘Z", onClick: () => ed()?.redo() },
        { separator: true },
        { label: "Copy", shortcut: "⌘C", onClick: () => ed()?.copySelection() },
        { label: "Paste", shortcut: "⌘V", onClick: () => void ed()?.paste() },
        { label: "Duplicate", shortcut: "⌘D", onClick: () => void ed()?.duplicateSelected() },
        { label: "Delete", shortcut: "⌫", onClick: () => void ed()?.removeSelected() },
        { label: "Select All", shortcut: "⌘A", onClick: () => void ed()?.selectAll() },
      ],
    },
    {
      label: "View",
      items: [
        { label: "Fit to Screen", onClick: () => void ed()?.zoomToFit() },
        { separator: true },
        { label: "Zoom In", shortcut: "⌘+", onClick: () => void ed()?.zoomIn() },
        { label: "Zoom Out", shortcut: "⌘−", onClick: () => void ed()?.zoomOut() },
        { label: "Reset Zoom", shortcut: "⌘0", onClick: () => void ed()?.resetZoom() },
        { separator: true },
        { label: `${nodeStyle === "studio" ? "✓ " : ""}Studio nodes`, onClick: () => setStyle("studio") },
        { label: `${nodeStyle === "flat" ? "✓ " : ""}Compact nodes`, onClick: () => setStyle("flat") },
      ],
    },
    {
      label: "Block",
      items: [{ label: "Import DSP Block…", onClick: () => setModal("import-block") }],
    },
    {
      label: "Help",
      items: [{ label: "About FaustMod", onClick: () => setModal("about") }],
    },
  ];

  return (
    <div className="app" data-node-style={nodeStyle}>
      <MenuBar
        menus={menus}
        playing={playing}
        recording={recording}
        status={status}
        onTogglePlay={togglePlay}
        onToggleRecord={toggleRecord}
        onMasterVolume={(v) => {
          AudioEngine.setMasterVolume(v);
          pm()?.markDirty();
        }}
      />
      <TabBar
        tabs={tabs}
        active={activeTab}
        onSelect={(i) => void tb()?.switchTo(i)}
        onClose={(i) => void tb()?.closeTab(i)}
        onNew={() => void tb()?.newTab()}
      />
      <div className="body">
        <LibraryPanel disabled={!ready} />
        <div
          className="canvas"
          ref={canvasRef}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(COMPONENT_DND_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData(COMPONENT_DND_TYPE);
            if (!id) return;
            e.preventDefault();
            const def = resolveComponent(id);
            const editor = ed();
            if (!def || !editor) return;
            void editor.addComponent(def, editor.screenToWorld(e.clientX, e.clientY));
          }}
        />
        <ModulePanel
          disabled={!ready}
          onEdit={(def: ComponentDef, readOnly: boolean) => {
            if (!def.code) return;
            if (readOnly) setEditTarget({ kind: "example", title: def.title, code: def.code });
            else setEditTarget({ kind: "user", id: def.id, title: def.title, code: def.code });
          }}
        />
      </div>

      {modal === "import-block" && (
        <ImportBlockModal
          onClose={() => setModal(null)}
          onImported={(title) => setStatus(`Added block "${title}"`)}
        />
      )}
      {modal === "presets" && (
        <PresetModal
          onClose={() => setModal(null)}
          onOpen={(p) => {
            void tb()?.openPatch(structuredClone(p.patch));
            setStatus(`Opened preset "${p.name}"`);
          }}
        />
      )}
      {modal === "about" && <AboutModal onClose={() => setModal(null)} />}
      {modal === "settings" && <SettingsModal onClose={() => setModal(null)} />}

      {editTarget && (
        <FaustEditor
          key={editTarget.kind === "node" ? editTarget.nodeId : editTarget.title}
          title={editTarget.title}
          initialCode={editTarget.code}
          readOnly={editTarget.kind === "example"}
          onCancel={() => setEditTarget(null)}
          onSaveDraft={
            editTarget.kind === "user"
              ? (code) => {
                  CustomBlocks.saveDraft(editTarget.id, code);
                  setEditTarget(null);
                  setStatus(`Saved "${editTarget.title}" (not compiled)`);
                }
              : undefined
          }
          onApply={
            editTarget.kind === "example"
              ? undefined
              : async (code) => {
                  if (editTarget.kind === "node") {
                    await editorRef.current!.applyModuleCode(editTarget.nodeId, code);
                  } else {
                    await updateUserModule(editTarget.id, code);
                  }
                  setEditTarget(null);
                  setStatus(`Recompiled "${editTarget.title}"`);
                }
          }
        />
      )}

      <TooltipLayer />

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            {
              label: ctxMenu.inputKey
                ? `Add V Slider → ${ctxMenu.inputLabel ?? "input"}`
                : "Add V Slider",
              onClick: () => runAddSlider("v"),
            },
            {
              label: ctxMenu.inputKey
                ? `Add H Slider → ${ctxMenu.inputLabel ?? "input"}`
                : "Add H Slider",
              onClick: () => runAddSlider("h"),
            },
          ]}
        />
      )}
    </div>
  );
}

/** Recompile a saved user module's edited source and persist it (ports re-derived). */
async function updateUserModule(id: string, code: string): Promise<void> {
  const compiled = await FaustService.compile(`${id}-edit`, code);
  const { inputs, outputs } = derivePorts(compiled.generator.getJSON(), code);
  const base = CustomBlocks.get(id);
  CustomBlocks.add({
    id,
    title: base?.title ?? "Module",
    category: base?.category ?? "Custom",
    inputs,
    outputs,
    code,
    dirty: false, // compiled cleanly
  });
}
