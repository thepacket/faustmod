import { useEffect, useRef, useState } from "react";
import { createEditor, type EditorHandle } from "../editor/createEditor";
import { LibraryService } from "../components/LibraryService";
import { COMPONENT_DND_TYPE } from "../components/library";
import { resolveComponent } from "../components/customBlocks";
import { AudioGraph } from "../audio/AudioGraph";
import { AudioEngine } from "../audio/AudioEngine";
import { PatchManager } from "../patch/PatchManager";
import { TabsManager, type TabInfo } from "../patch/TabsManager";
import { MenuBar, type Menu } from "./MenuBar";
import { TabBar } from "./TabBar";
import { LibraryPanel } from "./LibraryPanel";
import { ModulePanel } from "./ModulePanel";
import { ImportBlockModal } from "./ImportBlockModal";
import { AboutModal } from "./AboutModal";
import { SettingsModal } from "./SettingsModal";
import { PresetModal } from "./PresetModal";
import { CodeEditor } from "./CodeEditor";
import { faustLang, pdLang } from "./editorLangs";
import { PdModules, parsePdPorts } from "../patch/pdModules";
import { ModuleEditBridge } from "../editor/widgets/ModuleEditBridge";
import { RecordBridge } from "../editor/widgets/RecordBridge";
import { ContextMenuBridge, type ContextMenuTarget } from "../editor/widgets/ContextMenuBridge";
import { SavedPatches } from "../patch/savedPatches";
import { emptyPatch, parsePatch, PATCH_EXTENSION } from "../patch/format";
import { buildBackup, importBackup } from "../patch/backup";
import { download } from "../patch/download";
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
  | { kind: "example"; title: string; code: string }
  // Pd module — `id` present when editing an existing one, absent when new.
  | { kind: "pd"; id?: string; title: string; code: string };

// Starter Pd module: audio through a gain, with the metadata conventions filled in.
const NEW_PD_CODE = `#N canvas 0 0 460 320 12;
#X obj 40 60 adc~ 1;
#X obj 160 60 adc~ 2;
#X obj 40 130 *~;
#X obj 40 200 dac~ 1;
#X connect 0 0 2 0;
#X connect 1 0 2 1;
#X connect 2 0 3 0;
#X text 40 20 @name New Pd Module;
#X text 40 240 @desc Audio through a gain.;
#X text 40 260 @in audio gain;
#X text 240 260 @out out;
#X text 40 280 @param gain 1 0 1;`;

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
    let autosaveTimer: number | undefined;
    let flushAutosaveRef: () => void = () => {};

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
      // Autosave: a tab backed by a Saved Patches entry writes its edits back to that
      // entry (debounced), so the library is always current.
      const scheduleAutosave = (m: PatchManager, t: TabsManager) => {
        const savedId = t.activeSavedId();
        if (!savedId) return;
        window.clearTimeout(autosaveTimer);
        autosaveTimer = window.setTimeout(() => SavedPatches.update(savedId, m.build()), 600);
      };
      const flushAutosave = () => {
        window.clearTimeout(autosaveTimer);
        const savedId = tabsMgr.activeSavedId();
        if (savedId) SavedPatches.update(savedId, mgr.build());
      };
      flushAutosaveRef = flushAutosave;
      mgr.onChange = () => {
        setPatchName(mgr.name);
        tabsMgr.syncActive();
      };
      tabsMgr.onChange = () => {
        setTabs(tabsMgr.list());
        setActiveTab(tabsMgr.activeIndex());
      };
      // Every edit reschedules the debounced autosave (markDirty alone only fires once).
      handle.setChangeListener(() => {
        mgr.markDirty();
        scheduleAutosave(mgr, tabsMgr);
      });
      // Capture the final edit before a tab switch/close discards it, and on page unload.
      tabsMgr.onBeforeLeaveTab = flushAutosave;
      window.addEventListener("beforeunload", flushAutosave);
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
      window.clearTimeout(autosaveTimer);
      window.removeEventListener("beforeunload", flushAutosaveRef);
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

  const runAddControl = (control: "slider-v" | "slider-h" | "knob") => {
    const ed = editorRef.current;
    if (!ed || !ctxMenu) return;
    const orientation = control === "slider-h" ? "h" : "v";
    if (ctxMenu.allInputs && ctxMenu.nodeId) {
      void ed.addControlsForAllInputs(ctxMenu.nodeId, control);
    } else if (ctxMenu.nodeId && ctxMenu.inputKey) {
      if (control === "knob") void ed.addKnobForInput(ctxMenu.nodeId, ctxMenu.inputKey);
      else void ed.addSliderForInput(ctxMenu.nodeId, ctxMenu.inputKey, orientation);
    } else {
      const pos = ed.screenToWorld(ctxMenu.x, ctxMenu.y);
      if (control === "knob") void ed.addKnob(pos);
      else void ed.addSlider(orientation, pos);
    }
  };

  const uniquePatchName = (base: string) => {
    const taken = new Set(SavedPatches.all().map((p) => p.name));
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    return name;
  };

  // New: create a fresh patch entry in the library and open it in a new (linked) tab.
  const newPatch = () => {
    const name = uniquePatchName("Untitled");
    const patch = { ...emptyPatch(), name };
    const id = `saved-${Date.now().toString(36)}`;
    SavedPatches.add({ id, name, patch });
    void tabsRef.current?.openPatch(structuredClone(patch), id);
    setStatus(`New patch "${name}"`);
  };

  // Load a patch from disk straight into a (linked) tab, and add it to the library.
  const loadPatchFromDisk = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${PATCH_EXTENSION},application/json`;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const patch = parsePatch(await file.text());
        const name = uniquePatchName(patch.name?.trim() || file.name.replace(/\.faustmod$/i, ""));
        const id = `saved-${Date.now().toString(36)}`;
        const stored = { ...patch, name };
        SavedPatches.add({ id, name, patch: stored });
        void tabsRef.current?.openPatch(structuredClone(stored), id);
        setStatus(`Loaded patch "${name}"`);
      } catch (e) {
        setStatus(`Could not load patch: ${(e as Error).message}`);
      }
    };
    input.click();
  };

  const openSavedPatch = (id: string) => {
    const p = SavedPatches.get(id);
    if (p) void tabsRef.current?.openPatch(structuredClone(p.patch), id);
  };

  const renamePatch = (id: string, name: string) => {
    SavedPatches.rename(id, name);
    tabsRef.current?.renameSaved(id, name.trim());
  };

  // Portable backup of ALL localStorage-bound work — carry it between machines/browsers
  // (localStorage never leaves the device it was made on).
  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`faustmod-backup-${stamp}.json`, buildBackup(), "application/json");
    setStatus("Exported your full library — keep this file to restore on another device");
  };

  const importAll = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const r = importBackup(await file.text());
        setStatus(
          `Imported ${r.modules} modules, ${r.saved} patches, ${r.settings} settings`,
        );
      } catch (e) {
        setStatus(`Import failed: ${(e as Error).message}`);
      }
    };
    input.click();
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
      if (!inField && mod && k === "d") {
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
        // Faust DSP and patches live in the library, not in files — so no New/Open/Save
        // here. Only whole-library backup Export/Import, and Settings.
        { label: "Export All (backup)…", onClick: () => exportAll() },
        { label: "Import All (restore)…", onClick: () => importAll() },
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
        { separator: true },
        { label: "Align Left", onClick: () => void ed()?.alignSelected("left") },
        { label: "Align Center", onClick: () => void ed()?.alignSelected("center") },
        { label: "Align Right", onClick: () => void ed()?.alignSelected("right") },
        { label: "Align Top", onClick: () => void ed()?.alignSelected("top") },
        { label: "Align Middle", onClick: () => void ed()?.alignSelected("middle") },
        { label: "Align Bottom", onClick: () => void ed()?.alignSelected("bottom") },
        { separator: true },
        { label: "Distribute Horizontally", onClick: () => void ed()?.distributeSelected("h") },
        { label: "Distribute Vertically", onClick: () => void ed()?.distributeSelected("v") },
        { separator: true },
        { label: "Arrange in Grid", onClick: () => void ed()?.gridSelected() },
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
            const editor = ed();
            if (!editor) return;
            const pos = editor.screenToWorld(e.clientX, e.clientY);
            // Knob-bank components expand into an N×N grid of knobs, not one node.
            const grid = /^knobs-(\d+)$/.exec(id);
            if (grid) {
              void editor.addKnobGrid(Number(grid[1]), pos);
              return;
            }
            const def = resolveComponent(id);
            if (!def) return;
            void editor.addComponent(def, pos);
          }}
        />
        <ModulePanel
          disabled={!ready}
          onNewPatch={newPatch}
          onLoadPatch={loadPatchFromDisk}
          onOpenPatch={openSavedPatch}
          onRenamePatch={renamePatch}
          onEdit={(def: ComponentDef, readOnly: boolean) => {
            if (!def.code) return;
            if (readOnly) setEditTarget({ kind: "example", title: def.title, code: def.code });
            else setEditTarget({ kind: "user", id: def.id, title: def.title, code: def.code });
          }}
          onEditPd={(id) => {
            const m = id ? PdModules.get(id) : undefined;
            setEditTarget({
              kind: "pd",
              id,
              title: m?.title ?? "New Pd Module",
              code: m?.code ?? NEW_PD_CODE,
            });
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
        <CodeEditor
          key={
            editTarget.kind === "node"
              ? editTarget.nodeId
              : ("id" in editTarget && editTarget.id) || editTarget.title
          }
          lang={editTarget.kind === "pd" ? pdLang : faustLang}
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
                  } else if (editTarget.kind === "pd") {
                    await savePdModule(editTarget.id, code);
                  } else {
                    await updateUserModule(editTarget.id, code);
                  }
                  setEditTarget(null);
                  setStatus(`Saved "${editTarget.title}"`);
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
          items={(() => {
            const suffix = ctxMenu.allInputs
              ? " to all inputs"
              : ctxMenu.inputKey
                ? ` → ${ctxMenu.inputLabel ?? "input"}`
                : "";
            return [
              { label: `Add V Slider${suffix}`, onClick: () => runAddControl("slider-v") },
              { label: `Add H Slider${suffix}`, onClick: () => runAddControl("slider-h") },
              { label: `Add Knob${suffix}`, onClick: () => runAddControl("knob") },
            ];
          })()}
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

/** Validate a Pd module with WebPd, then save it (new when id is undefined). */
async function savePdModule(id: string | undefined, code: string): Promise<void> {
  const { compilePd } = await import("../audio/PdEngine");
  const { inputs, outputs, name, desc } = parsePdPorts(code);
  await compilePd(code, Math.max(2, inputs.length)); // throws → surfaced in the editor
  const mid = id ?? `pd-${Date.now().toString(36)}`;
  const title = name ?? (id ? PdModules.get(id)?.title : undefined) ?? "Pd Module";
  PdModules.add({ id: mid, title, code, inputs, outputs, desc });
}
