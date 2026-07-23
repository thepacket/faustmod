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

export type AlignMode = "left" | "right" | "center" | "top" | "bottom" | "middle";

export interface EditorHandle {
  addComponent(def: ComponentDef, position?: { x: number; y: number }): Promise<DspNode>;
  /** Add a slider (world position); range defaults to 0–1. Unconnected. */
  addSlider(orientation: "v" | "h", position?: { x: number; y: number }): Promise<void>;
  /**
   * Add a slider configured from an input port's declared range (default/min/max) and
   * wire it into that input. Placed just to the left of the target node.
   */
  addSliderForInput(nodeId: string, inputKey: string, orientation: "v" | "h"): Promise<void>;
  /** Add a knob (world position); range defaults to 0–1. Unconnected. */
  addKnob(position?: { x: number; y: number }): Promise<void>;
  /** Drop an N×N grid of unconnected knobs, top-left at the given world position. */
  addKnobGrid(size: number, position?: { x: number; y: number }): Promise<void>;
  /** Add a knob configured from an input port's declared range and wire it in. */
  addKnobForInput(nodeId: string, inputKey: string): Promise<void>;
  /**
   * Attach a control (slider-v / slider-h / knob) to every control input of a node,
   * each configured from its input's range and wired in.
   */
  addControlsForAllInputs(
    nodeId: string,
    componentId: "slider-v" | "slider-h" | "knob",
  ): Promise<void>;
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
  /** Align selected nodes to a shared edge or centre line. */
  alignSelected(mode: AlignMode): Promise<void>;
  /** Even out the gaps between selected nodes along an axis. */
  distributeSelected(axis: "h" | "v"): Promise<void>;
  /** Pack selected nodes into a tidy grid/matrix (near-square, or a fixed column count). */
  gridSelected(cols?: number): Promise<void>;
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

  // Create a control widget (slider/knob) with a per-instance range (stored in
  // widgetState so it persists across save/load), optionally wired into a target input.
  const spawnControl = async (
    componentId: string,
    range: { min: number; max: number; value: number },
    position?: { x: number; y: number },
    connectTo?: { node: DspNode; inputKey: string },
    label?: string,
  ): Promise<DspNode | null> => {
    const def = resolveComponent(componentId);
    if (!def) return null;
    // Tune the config so the widget mounts with the right range/value immediately;
    // also mirror it into widgetState so it survives save/load.
    const tuned: ComponentDef = {
      ...def,
      widgetConfig: { ...def.widgetConfig, min: range.min, max: range.max, default: range.value },
    };
    const node = await instantiate(tuned, position);
    node.widgetState = { min: range.min, max: range.max, value: range.value };
    // Name the control after the input it drives, so a grid of knobs is legible.
    if (label) node.label = label;
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
    return node;
  };

  // The range/placement for a control wired into a given input port.
  const controlForInput = (nodeId: string, inputKey: string) => {
    const target = editor.getNode(nodeId) as DspNode | undefined;
    if (!target) return null;
    const spec = target.inputSpecs[inputKey];
    const min = spec?.min ?? 0;
    const max = spec?.max ?? 1;
    const value = spec?.default ?? (min + max) / 2;
    const view = area.nodeViews.get(nodeId);
    const pos = view ? { x: view.position.x - 70, y: view.position.y + 10 } : undefined;
    return { target, range: { min, max, value }, pos, label: spec?.label };
  };

  const addSlider: EditorHandle["addSlider"] = async (orientation, position) => {
    await spawnControl(orientation === "h" ? "slider-h" : "slider-v", { min: 0, max: 1, value: 0.5 }, position);
  };

  const addSliderForInput: EditorHandle["addSliderForInput"] = async (
    nodeId,
    inputKey,
    orientation,
  ) => {
    const c = controlForInput(nodeId, inputKey);
    if (!c) return;
    await spawnControl(orientation === "h" ? "slider-h" : "slider-v", c.range, c.pos, {
      node: c.target,
      inputKey,
    });
  };

  const addKnob: EditorHandle["addKnob"] = async (position) => {
    await spawnControl("knob", { min: 0, max: 1, value: 0.5 }, position);
  };

  const addKnobGrid: EditorHandle["addKnobGrid"] = async (size, position) => {
    const n = Math.max(1, Math.floor(size));
    const originX = position?.x ?? 100;
    const originY = position?.y ?? 80;
    const ids: string[] = [];
    for (let i = 0; i < n * n; i++) {
      const node = await spawnControl("knob", { min: 0, max: 1, value: 0.5 }, { x: originX, y: originY });
      if (node) ids.push(node.id);
    }
    await placeGrid(ids, n, originX, originY, gridCell(ids));
    notifyChange();
  };

  const addKnobForInput: EditorHandle["addKnobForInput"] = async (nodeId, inputKey) => {
    const c = controlForInput(nodeId, inputKey);
    if (!c) return;
    // Name the knob after its input so it's identifiable on the canvas.
    await spawnControl("knob", c.range, c.pos, { node: c.target, inputKey }, c.label);
  };

  // Right-click the title → attach a control to every CONTROL input (those with a
  // declared default/range). Knobs (compact) tile into a MATRIX to the left of the node so
  // a many-input module doesn't produce an unusable tall column; sliders stay in a column
  // (they're already wide/short enough, and a slider grid reads poorly).
  const addControlsForAllInputs: EditorHandle["addControlsForAllInputs"] = async (
    nodeId,
    componentId,
  ) => {
    const target = editor.getNode(nodeId) as DspNode | undefined;
    if (!target) return;
    const controlKeys = Object.entries(target.inputSpecs).filter(
      ([, spec]) => spec.default !== undefined, // control inputs only, not audio signals
    );
    if (controlKeys.length === 0) return;
    const view = area.nodeViews.get(nodeId);
    const nodeX = view ? view.position.x : 0;
    const nodeY = view ? view.position.y : 0;
    const isKnob = componentId === "knob";

    // Spawn each control near the node, naming knobs after their input, then pack them
    // into a tight grid (knobs) or column (sliders) using MEASURED sizes.
    const ids: string[] = [];
    for (const [key, spec] of controlKeys) {
      const min = spec.min ?? 0;
      const max = spec.max ?? 1;
      const value = spec.default ?? (min + max) / 2;
      const node = await spawnControl(
        componentId,
        { min, max, value },
        { x: nodeX, y: nodeY },
        { node: target, inputKey: key },
        isKnob ? spec.label : undefined,
      );
      if (node) ids.push(node.id);
    }
    const cols = isKnob ? Math.max(1, Math.ceil(Math.sqrt(ids.length))) : 1;
    const cell = gridCell(ids);
    // Sit the grid just left of the node; its right column ends ~40px before it.
    const originX = nodeX - 40 - cols * cell.w;
    await placeGrid(ids, cols, originX, nodeY, cell);
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

  // Bounding boxes (world coords) of the currently selected nodes.
  const selectedBoxes = () => {
    const out: { id: string; x: number; y: number; w: number; h: number }[] = [];
    for (const node of editor.getNodes()) {
      if (!(node as any).selected) continue;
      const view = area.nodeViews.get(node.id);
      if (!view) continue;
      out.push({
        id: node.id,
        x: view.position.x,
        y: view.position.y,
        w: view.element.offsetWidth,
        h: view.element.offsetHeight,
      });
    }
    return out;
  };

  const alignSelected: EditorHandle["alignSelected"] = async (mode) => {
    const sel = selectedBoxes();
    if (sel.length < 2) return;
    const minX = Math.min(...sel.map((s) => s.x));
    const maxRight = Math.max(...sel.map((s) => s.x + s.w));
    const minY = Math.min(...sel.map((s) => s.y));
    const maxBottom = Math.max(...sel.map((s) => s.y + s.h));
    const cx = (minX + maxRight) / 2;
    const cy = (minY + maxBottom) / 2;
    for (const s of sel) {
      let { x, y } = s;
      if (mode === "left") x = minX;
      else if (mode === "right") x = maxRight - s.w;
      else if (mode === "center") x = cx - s.w / 2;
      else if (mode === "top") y = minY;
      else if (mode === "bottom") y = maxBottom - s.h;
      else if (mode === "middle") y = cy - s.h / 2;
      await area.translate(s.id, { x, y });
    }
    notifyChange();
  };

  const distributeSelected: EditorHandle["distributeSelected"] = async (axis) => {
    const sel = selectedBoxes();
    if (sel.length < 3) return; // need endpoints + at least one node to move between
    const horizontal = axis === "h";
    sel.sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
    const first = sel[0];
    const last = sel[sel.length - 1];
    const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y;
    const sizes = sel.reduce((n, s) => n + (horizontal ? s.w : s.h), 0);
    const gap = (span - sizes) / (sel.length - 1);
    let cursor = horizontal ? first.x : first.y;
    for (const s of sel) {
      await area.translate(s.id, horizontal ? { x: cursor, y: s.y } : { x: s.x, y: cursor });
      cursor += (horizontal ? s.w : s.h) + gap;
    }
    notifyChange();
  };

  // A uniform grid cell sized to the largest node in the set + a minimal gap, so packed
  // nodes sit as tight as possible without touching.
  const GRID_GAP = 8;
  const gridCell = (ids: string[]) => {
    let w = 0;
    let h = 0;
    for (const id of ids) {
      const v = area.nodeViews.get(id);
      if (!v) continue;
      w = Math.max(w, v.element.offsetWidth);
      h = Math.max(h, v.element.offsetHeight);
    }
    return { w: w + GRID_GAP, h: h + GRID_GAP };
  };

  // Lay ids out row-major into `cols` columns from (originX, originY) using cell size.
  const placeGrid = async (
    ids: string[],
    cols: number,
    originX: number,
    originY: number,
    cell: { w: number; h: number },
  ) => {
    for (let k = 0; k < ids.length; k++) {
      const row = Math.floor(k / cols);
      const col = k % cols;
      await area.translate(ids[k], { x: originX + col * cell.w, y: originY + row * cell.h });
    }
  };

  // Pack the selection into a tidy grid. Nodes keep their reading order (top-to-bottom,
  // then left-to-right), so a tall column of knobs becomes a compact matrix in the same
  // order. Cells are sized to the largest member so rows and columns line up, with minimal
  // spacing.
  const gridSelected: EditorHandle["gridSelected"] = async (cols) => {
    const sel = selectedBoxes();
    if (sel.length < 2) return;
    sel.sort((a, b) => a.y - b.y || a.x - b.x);
    const ncols = Math.max(1, cols ?? Math.ceil(Math.sqrt(sel.length)));
    const originX = Math.min(...sel.map((s) => s.x));
    const originY = Math.min(...sel.map((s) => s.y));
    const ids = sel.map((s) => s.id);
    await placeGrid(ids, ncols, originX, originY, gridCell(ids));
    notifyChange();
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
    // Input ports and node titles open their own menus (via ThemedNode).
    const el = e.target as HTMLElement;
    if (el.closest(".dsp-port.dsp-input") || el.closest(".dsp-title")) return;
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
    addKnob,
    addKnobForInput,
    addKnobGrid,
    addControlsForAllInputs,
    screenToWorld,
    getModuleCode,
    getNodeTitle,
    applyModuleCode,
    removeSelected,
    duplicateSelected,
    alignSelected,
    distributeSelected,
    gridSelected,
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
