import { NodeEditor, ClassicPreset, type GetSchemes } from "rete";
import { AreaPlugin, AreaExtensions } from "rete-area-plugin";
import {
  ConnectionPlugin,
  Presets as ConnectionPresets,
} from "rete-connection-plugin";
import {
  ReactPlugin,
  Presets as ReactPresets,
  type ReactArea2D,
} from "rete-react-plugin";
import {
  HistoryPlugin,
  HistoryExtensions,
  Presets as HistoryPresets,
} from "rete-history-plugin";
import { createRoot } from "react-dom/client";

import { DspNode, indexFromKey, outKey } from "./DspNode";
import { ThemedNode } from "./theme/ThemedNode";
import { ThemedSocket } from "./theme/ThemedSocket";
import { AudioGraph } from "../audio/AudioGraph";
import { FaustService } from "../audio/FaustService";
import { derivePorts } from "../audio/faustIO";
import { type ComponentDef } from "../components/library";
import { resolveComponent } from "../components/customBlocks";
import type { GraphSnapshot } from "../patch/format";
import { WidgetBridge } from "./widgets/WidgetBridge";
import { ContextMenuBridge } from "./widgets/ContextMenuBridge";
import "./theme/theme.css";

export type { GraphSnapshot } from "../patch/format";

// rete presets require the base ClassicPreset.Node as the scheme's node type;
// DspNode is used at runtime as a subclass and cast back where its fields are needed.
type Node = ClassicPreset.Node;
type Conn = ClassicPreset.Connection<Node, Node>;
type Schemes = GetSchemes<Node, Conn>;
type AreaExtra = ReactArea2D<Schemes>;

export interface EditorHandle {
  addComponent(def: ComponentDef, position?: { x: number; y: number }): Promise<DspNode>;
  /** Add a slider (world position); range defaults to 0–1. Unconnected. */
  addSlider(position?: { x: number; y: number }): Promise<void>;
  /**
   * Add a slider configured from an input port's declared range (default/min/max) and
   * wire it into that input. Placed just to the left of the target node.
   */
  addSliderForInput(nodeId: string, inputKey: string): Promise<void>;
  /** Convert a viewport (client) point to editor world coordinates (for drops). */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number };
  /** Current Faust source of a module node (edited override, else stock), or null. */
  getModuleCode(nodeId: string): string | null;
  /** Display label of a node (for the editor title). */
  getNodeTitle(nodeId: string): string;
  /** Recompile a module node with edited source and rebuild it in place. Throws on error. */
  applyModuleCode(nodeId: string, code: string): Promise<void>;
  removeSelected(): Promise<void>;
  duplicateSelected(): Promise<void>;
  copySelection(): void;
  paste(): Promise<void>;
  selectAll(): Promise<void>;
  clear(): Promise<void>;
  snapshot(): GraphSnapshot;
  load(snapshot: GraphSnapshot): Promise<void>;
  zoomToFit(): Promise<void>;
  zoomIn(): Promise<void>;
  zoomOut(): Promise<void>;
  resetZoom(): Promise<void>;
  undo(): void;
  redo(): void;
  /** Register a callback fired whenever the graph changes (for dirty tracking). */
  setChangeListener(cb: (() => void) | null): void;
  destroy(): void;
}

export async function createEditor(container: HTMLElement): Promise<EditorHandle> {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });
  const history = new HistoryPlugin<Schemes>();

  // One selector drives all selection (click, marquee, Select All) so state stays
  // consistent. `selectable.select/unselect` go through this same selector.
  // `accumulating.active()` is read by rete when a node is picked (mousedown): true
  // keeps the current selection (so grabbing an already-selected node drags the whole
  // group), false reduces it to the picked node. Set from the pointerdown below.
  let pickAccumulate = false; // a modifier (Shift/Ctrl/⌘) is held
  let pickPreserve = false; // the grabbed node was already selected
  const selector = AreaExtensions.selector();
  const selectable = AreaExtensions.selectableNodes(area, selector, {
    accumulating: { active: () => pickAccumulate || pickPreserve },
  });

  render.addPreset(
    ReactPresets.classic.setup({
      customize: {
        node: () => ThemedNode as never,
        socket: () => ThemedSocket as never,
      },
    }),
  );
  connection.addPreset(ConnectionPresets.classic.setup());
  history.addPreset(HistoryPresets.classic.setup());

  editor.use(area);
  area.use(connection);
  area.use(render);
  area.use(history);
  HistoryExtensions.keyboard(history);

  AreaExtensions.simpleNodesOrder(area);

  let changeCb: (() => void) | null = null;
  const notifyChange = () => changeCb?.();

  // Let widget node bodies re-measure themselves after a resize + mark dirty.
  WidgetBridge.updateNode = (nodeId) => void area.update("node", nodeId);
  WidgetBridge.onChange = () => notifyChange();
  WidgetBridge.zoom = () => area.area.transform.k;

  // --- mirror editor events into the live audio graph ---------------------
  editor.addPipe((ctx) => {
    if (ctx.type === "connectioncreated") {
      const c = ctx.data;
      AudioGraph.setConn(c.id, {
        src: c.source,
        srcIdx: indexFromKey(c.sourceOutput),
        dst: c.target,
        dstIdx: indexFromKey(c.targetInput),
      });
      notifyChange();
    } else if (ctx.type === "connectionremoved") {
      void AudioGraph.removeConn(ctx.data.id);
      notifyChange();
    } else if (ctx.type === "nodecreated") {
      notifyChange();
    } else if (ctx.type === "noderemoved") {
      void AudioGraph.removeNode(ctx.data.id);
      notifyChange();
    }
    return ctx;
  });

  // Node drags mark the patch dirty too.
  area.addPipe((ctx) => {
    if (ctx.type === "nodetranslated") notifyChange();
    return ctx;
  });

  let spawnOffset = 0;

  const onValueChange = (nodeId: string, value: number) => {
    AudioGraph.setValue(nodeId, value);
    notifyChange();
  };

  // Instantiate a node from a def, optionally with an edited-source override (module
  // editor). The override compiles `code` instead of loading the stock factory, and
  // `def` must already carry ports derived from that code.
  const instantiate = async (
    def: ComponentDef,
    position?: { x: number; y: number },
    overrideCode?: string,
  ): Promise<DspNode> => {
    const node = new DspNode(def, onValueChange);
    await editor.addNode(node);

    AudioGraph.setNode(node.id, def.id);
    if (overrideCode) {
      node.code = overrideCode;
      AudioGraph.setOverride(node.id, overrideCode, def.inputs);
    }
    if (def.kind === "constant") AudioGraph.setValue(node.id, def.value ?? 0);

    const pos = position ?? {
      x: 100 + (spawnOffset % 4) * 240,
      y: 80 + Math.floor(spawnOffset / 4) * 200 + (spawnOffset % 2) * 30,
    };
    spawnOffset++;
    await area.translate(node.id, pos);
    return node;
  };

  const addComponent: EditorHandle["addComponent"] = (def, position) =>
    instantiate(def, position);

  // Create a vertical slider node with a per-instance range (stored in widgetState so
  // it persists across save/load), optionally wired into a target control input.
  const spawnSlider = async (
    range: { min: number; max: number; value: number },
    position?: { x: number; y: number },
    connectTo?: { node: DspNode; inputKey: string },
  ): Promise<void> => {
    const def = resolveComponent("slider-v");
    if (!def) return;
    const node = await instantiate(def, position);
    node.widgetState = { min: range.min, max: range.max, value: range.value };
    await area.update("node", node.id);
    if (connectTo) {
      const conn = new ClassicPreset.Connection(
        node as Node,
        outKey(0) as never,
        connectTo.node as Node,
        connectTo.inputKey as never,
      );
      await editor.addConnection(conn as Conn);
    }
    notifyChange();
  };

  const addSlider: EditorHandle["addSlider"] = (position) =>
    spawnSlider({ min: 0, max: 1, value: 0.5 }, position);

  const addSliderForInput: EditorHandle["addSliderForInput"] = async (nodeId, inputKey) => {
    const target = editor.getNode(nodeId) as DspNode | undefined;
    if (!target) return;
    const spec = target.inputSpecs[inputKey];
    const min = spec?.min ?? 0;
    const max = spec?.max ?? 1;
    const value = spec?.default ?? (min + max) / 2;
    const view = area.nodeViews.get(nodeId);
    const pos = view
      ? { x: view.position.x - 70, y: view.position.y + 10 }
      : undefined;
    await spawnSlider({ min, max, value }, pos, { node: target, inputKey });
  };

  // Resolve a component id to a def; if edited `code` is supplied, compile it (throws
  // on error) and rebuild the def's ports from the compiled program.
  const resolveDef = async (componentId: string, code?: string): Promise<ComponentDef | null> => {
    const base = resolveComponent(componentId);
    if (!base || !code) return base ?? null;
    const compiled = await FaustService.compile(`${componentId}-edit`, code);
    const { inputs, outputs } = derivePorts(compiled.generator.getJSON(), code);
    return { ...base, code, inputs, outputs };
  };

  const getModuleCode: EditorHandle["getModuleCode"] = (nodeId) => {
    const node = editor.getNode(nodeId) as DspNode | undefined;
    if (!node) return null;
    return node.code ?? resolveComponent(node.componentId)?.code ?? null;
  };

  const getNodeTitle: EditorHandle["getNodeTitle"] = (nodeId) => {
    const node = editor.getNode(nodeId) as DspNode | undefined;
    return node?.label ?? "Module";
  };

  const applyModuleCode: EditorHandle["applyModuleCode"] = async (nodeId, code) => {
    const node = editor.getNode(nodeId) as DspNode | undefined;
    if (!node) throw new Error("Node not found");
    // Compile + derive the new ports (throws → surfaced in the editor).
    const derived = await resolveDef(node.componentId, code);
    if (!derived) throw new Error("Unknown component");

    // Capture identity + wiring so we can rebuild the node with the new signature.
    const view = area.nodeViews.get(nodeId);
    const position = view ? { x: view.position.x, y: view.position.y } : undefined;
    const label = node.label;
    const attached = (editor.getConnections() as unknown as Conn[])
      .filter((c) => c.source === nodeId || c.target === nodeId)
      .map((c) => ({
        id: c.id,
        source: c.source,
        sourceOutput: c.sourceOutput as string,
        target: c.target,
        targetInput: c.targetInput as string,
      }));

    for (const c of attached) await editor.removeConnection(c.id);
    await selectable.unselect(nodeId).catch(() => {});
    await editor.removeNode(nodeId);

    const fresh = await instantiate(derived, position, code);
    (fresh as unknown as { label: string }).label = label;
    await area.update("node", fresh.id);

    // Re-wire connections that still have both endpoints on the (possibly reshaped) node.
    for (const c of attached) {
      const srcId = c.source === nodeId ? fresh.id : c.source;
      const dstId = c.target === nodeId ? fresh.id : c.target;
      const src = editor.getNode(srcId);
      const dst = editor.getNode(dstId);
      if (!src || !dst) continue;
      if (!src.outputs[c.sourceOutput] || !dst.inputs[c.targetInput]) continue;
      await editor.addConnection(
        new ClassicPreset.Connection(src, c.sourceOutput as never, dst, c.targetInput as never),
      );
    }
    notifyChange();
  };

  const removeSelected: EditorHandle["removeSelected"] = async () => {
    const selected = editor.getNodes().filter((n) => (n as any).selected);
    for (const node of selected) {
      // Remove attached connections first so the graph stays consistent.
      for (const c of editor.getConnections().filter(
        (c) => c.source === node.id || c.target === node.id,
      )) {
        await editor.removeConnection(c.id);
      }
      await selectable.unselect(node.id); // drop it from the selector before removal
      await editor.removeNode(node.id);
    }
  };

  const clear: EditorHandle["clear"] = async () => {
    for (const c of [...editor.getConnections()]) await editor.removeConnection(c.id);
    for (const n of [...editor.getNodes()]) await editor.removeNode(n.id);
    await AudioGraph.clear();
  };

  const snapshot: EditorHandle["snapshot"] = () => {
    const nodes = (editor.getNodes() as DspNode[]).map((n) => {
      const view = area.nodeViews.get(n.id);
      const valueCtrl = n.controls.value as ClassicPreset.InputControl<"number"> | undefined;
      const isWidget = !!n.widget;
      const hasState = Object.keys(n.widgetState).length > 0;
      const def = resolveComponent(n.componentId);
      return {
        id: n.id,
        componentId: n.componentId,
        position: view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 },
        label: def && n.label !== def.title ? n.label : undefined,
        value: valueCtrl ? Number(valueCtrl.value) : undefined,
        size:
          isWidget && n.width != null && n.height != null
            ? { w: n.width, h: n.height }
            : undefined,
        state: isWidget && hasState ? { ...n.widgetState } : undefined,
        code: n.code, // edited module source, if any
      };
    });
    const connections = editor.getConnections().map((c) => ({
      id: c.id,
      source: c.source,
      sourceOutput: c.sourceOutput as string,
      target: c.target,
      targetInput: c.targetInput as string,
    }));
    return { nodes, connections };
  };

  const load: EditorHandle["load"] = async (snap) => {
    await clear();
    const idMap = new Map<string, string>();
    for (const n of snap.nodes) {
      // Edited modules carry their source; rebuild the def (ports) from it.
      let def: ComponentDef | null;
      try {
        def = await resolveDef(n.componentId, n.code);
      } catch (err) {
        console.warn(`Edited module "${n.componentId}" failed to compile on load — ${err}`);
        def = resolveComponent(n.componentId) ?? null;
      }
      if (!def) {
        console.warn(`Unknown component "${n.componentId}" in snapshot — skipped`);
        continue;
      }
      const node = await instantiate(def, n.position, n.code || undefined);
      idMap.set(n.id, node.id);
      if (def.kind === "constant" && typeof n.value === "number") {
        const ctrl = node.controls.value as ClassicPreset.InputControl<"number">;
        ctrl?.setValue(n.value);
        AudioGraph.setValue(node.id, n.value);
      }
      if (n.label) (node as unknown as { label: string }).label = n.label;
      if (n.size) {
        node.width = n.size.w;
        node.height = n.size.h;
      }
      if (n.state) node.widgetState = { ...n.state };
      await area.update("node", node.id);
    }
    for (const c of snap.connections) {
      const src = editor.getNode(idMap.get(c.source)!);
      const dst = editor.getNode(idMap.get(c.target)!);
      if (!src || !dst) continue;
      const conn = new ClassicPreset.Connection(
        src,
        c.sourceOutput as never,
        dst,
        c.targetInput as never,
      );
      await editor.addConnection(conn);
    }
    // Loading isn't an undoable edit — drop the history it just generated.
    (history as unknown as { clear?: () => void }).clear?.();
    await zoomToFit();
  };

  // A self-contained group of nodes + the connections among them (positions in world
  // coordinates). Used by duplicate and copy/paste.
  interface GroupSpec {
    nodes: {
      id: string;
      componentId: string;
      position: { x: number; y: number };
      label?: string;
      value?: number;
      size?: { w: number; h: number };
      state?: Record<string, unknown>;
      code?: string;
    }[];
    connections: { source: string; sourceOutput: string; target: string; targetInput: string }[];
  }

  /** Capture the current selection (nodes + internal connections) as a GroupSpec. */
  const snapshotSelection = (): GroupSpec | null => {
    const selected = (editor.getNodes() as DspNode[]).filter((n) => (n as any).selected);
    if (!selected.length) return null;
    const ids = new Set(selected.map((n) => n.id));
    const nodes = selected.map((n) => {
      const view = area.nodeViews.get(n.id);
      const ctrl = n.controls.value as ClassicPreset.InputControl<"number"> | undefined;
      return {
        id: n.id,
        componentId: n.componentId,
        position: view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 },
        label: n.label,
        value: n.componentId === "constant" && ctrl ? Number(ctrl.value) : undefined,
        size: n.width && n.height ? { w: n.width, h: n.height } : undefined,
        state:
          n.widgetState && Object.keys(n.widgetState).length
            ? (structuredClone(n.widgetState) as Record<string, unknown>)
            : undefined,
        code: n.code,
      };
    });
    const connections = (editor.getConnections() as unknown as Conn[])
      .filter((c) => ids.has(c.source) && ids.has(c.target))
      .map((c) => ({
        source: c.source,
        sourceOutput: c.sourceOutput as string,
        target: c.target,
        targetInput: c.targetInput as string,
      }));
    return { nodes, connections };
  };

  /** Recreate a GroupSpec at an offset and leave the new nodes selected as a group. */
  const instantiateGroup = async (spec: GroupSpec, dx: number, dy: number) => {
    await selector.unselectAll();
    const idMap = new Map<string, string>();
    for (const n of spec.nodes) {
      let def: ComponentDef | null;
      try {
        def = await resolveDef(n.componentId, n.code);
      } catch {
        def = resolveComponent(n.componentId) ?? null;
      }
      if (!def) continue;
      const copy = await instantiate(def, { x: n.position.x + dx, y: n.position.y + dy }, n.code || undefined);
      idMap.set(n.id, copy.id);
      if (n.label) (copy as unknown as { label: string }).label = n.label;
      if (n.value !== undefined) {
        const dstCtrl = copy.controls.value as ClassicPreset.InputControl<"number"> | undefined;
        dstCtrl?.setValue(n.value);
        AudioGraph.setValue(copy.id, n.value);
      }
      if (n.size) {
        copy.width = n.size.w;
        copy.height = n.size.h;
      }
      if (n.state) copy.widgetState = structuredClone(n.state);
      await area.update("node", copy.id);
    }
    for (const c of spec.connections) {
      const src = editor.getNode(idMap.get(c.source)!);
      const dst = editor.getNode(idMap.get(c.target)!);
      if (!src || !dst) continue;
      await editor.addConnection(
        new ClassicPreset.Connection(src, c.sourceOutput as never, dst, c.targetInput as never),
      );
    }
    for (const newId of idMap.values()) await selectable.select(newId, true);
    notifyChange();
  };

  const duplicateSelected: EditorHandle["duplicateSelected"] = async () => {
    const spec = snapshotSelection();
    if (spec) await instantiateGroup(spec, 40, 40);
  };

  // In-memory clipboard for copy/paste; each paste cascades a little further.
  let clipboard: GroupSpec | null = null;
  let pasteCount = 0;
  const copySelection: EditorHandle["copySelection"] = () => {
    const spec = snapshotSelection();
    if (spec) {
      clipboard = spec;
      pasteCount = 0;
    }
  };
  const paste: EditorHandle["paste"] = async () => {
    if (!clipboard) return;
    pasteCount++;
    await instantiateGroup(clipboard, 30 * pasteCount, 30 * pasteCount);
  };

  const selectAll: EditorHandle["selectAll"] = async () => {
    for (const node of editor.getNodes()) await selectable.select(node.id, true);
  };

  const zoomToFit: EditorHandle["zoomToFit"] = async () => {
    if (editor.getNodes().length) await AreaExtensions.zoomAt(area, editor.getNodes());
  };
  const zoomBy = async (factor: number) => {
    const { k } = area.area.transform;
    await area.area.zoom(k * factor, container.clientWidth / 2, container.clientHeight / 2);
  };
  const zoomIn = () => zoomBy(1.2);
  const zoomOut = () => zoomBy(1 / 1.2);
  const resetZoom = async () => {
    await area.area.zoom(1, container.clientWidth / 2, container.clientHeight / 2);
  };

  const undo = () => void history.undo();
  const redo = () => void history.redo();
  const setChangeListener = (cb: (() => void) | null) => {
    changeCb = cb;
  };

  const screenToWorld: EditorHandle["screenToWorld"] = (clientX, clientY) => {
    const rect = container.getBoundingClientRect();
    const t = area.area.transform;
    return { x: (clientX - rect.left - t.x) / t.k, y: (clientY - rect.top - t.y) / t.k };
  };

  // --- Marquee (rubber-band) selection on empty-canvas drag ----------------
  // View-only: goes through the shared selector, never touching graph structure.
  const marquee = document.createElement("div");
  marquee.className = "marquee";
  marquee.style.display = "none";
  container.appendChild(marquee);

  let spaceHeld = false;
  const onSpace = (e: KeyboardEvent) => {
    if (e.code === "Space") spaceHeld = e.type === "keydown";
  };
  window.addEventListener("keydown", onSpace);
  window.addEventListener("keyup", onSpace);

  const onCanvasPointerDown = (e: PointerEvent) => {
    const nodeEl = (e.target as HTMLElement).closest(".dsp-node");
    if (nodeEl) {
      // Grabbing a node: preserve the whole selection when it's already selected (no
      // modifier), so dragging it moves the group. rete then handles the node drag.
      pickAccumulate = e.shiftKey || e.metaKey || e.ctrlKey;
      pickPreserve = !pickAccumulate && nodeEl.getAttribute("data-selected") === "true";
      return;
    }
    pickAccumulate = false;
    pickPreserve = false;
    if (e.button !== 0 || spaceHeld) return; // space / middle / right drag → pan
    // Capture-phase intercept: stop rete from starting its own canvas pan.
    e.stopImmediatePropagation();
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const accumulate = e.shiftKey || e.metaKey || e.ctrlKey;
    let moved = false;

    const paint = (cx: number, cy: number) => {
      const r = container.getBoundingClientRect();
      marquee.style.left = `${Math.min(start.x, cx) - r.left}px`;
      marquee.style.top = `${Math.min(start.y, cy) - r.top}px`;
      marquee.style.width = `${Math.abs(cx - start.x)}px`;
      marquee.style.height = `${Math.abs(cy - start.y)}px`;
      marquee.style.display = "block";
    };
    const move = (ev: PointerEvent) => {
      if (!moved && (Math.abs(ev.clientX - start.x) > 3 || Math.abs(ev.clientY - start.y) > 3)) {
        moved = true;
      }
      if (moved) paint(ev.clientX, ev.clientY);
    };
    const up = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      marquee.style.display = "none";
      if (moved) {
        // Replace the selection unless accumulating (Shift/Ctrl/⌘), then add hits.
        if (!accumulate) await selector.unselectAll();
        const a = screenToWorld(start.x, start.y);
        const b = screenToWorld(ev.clientX, ev.clientY);
        const [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        const [y0, y1] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        for (const node of editor.getNodes()) {
          const view = area.nodeViews.get(node.id);
          if (!view) continue;
          const hit =
            view.position.x < x1 &&
            view.position.x + view.element.offsetWidth > x0 &&
            view.position.y < y1 &&
            view.position.y + view.element.offsetHeight > y0;
          if (hit) await selectable.select(node.id, true);
        }
      } else if (!accumulate) {
        // A plain click on empty canvas clears the selection.
        await selector.unselectAll();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  container.addEventListener("pointerdown", onCanvasPointerDown, true); // capture, before rete

  // Right-click anywhere that isn't an input port → generic context menu (Add Slider
  // at that spot). Input ports open their own menu via ThemedNode's React handler.
  const onContextMenu = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".dsp-port.dsp-input")) return;
    e.preventDefault();
    ContextMenuBridge.open({ x: e.clientX, y: e.clientY });
  };
  container.addEventListener("contextmenu", onContextMenu);

  const destroy = () => {
    window.removeEventListener("keydown", onSpace);
    window.removeEventListener("keyup", onSpace);
    container.removeEventListener("pointerdown", onCanvasPointerDown, true);
    container.removeEventListener("contextmenu", onContextMenu);
    area.destroy();
  };

  return {
    addComponent,
    addSlider,
    addSliderForInput,
    screenToWorld,
    getModuleCode,
    getNodeTitle,
    applyModuleCode,
    removeSelected,
    duplicateSelected,
    copySelection,
    paste,
    selectAll,
    clear,
    snapshot,
    load,
    zoomToFit,
    zoomIn,
    zoomOut,
    resetZoom,
    undo,
    redo,
    setChangeListener,
    destroy,
  };
}
