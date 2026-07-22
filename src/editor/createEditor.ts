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

import { DspNode, indexFromKey } from "./DspNode";
import { ThemedNode } from "./theme/ThemedNode";
import { ThemedSocket } from "./theme/ThemedSocket";
import { AudioGraph } from "../audio/AudioGraph";
import { type ComponentDef } from "../components/library";
import { resolveComponent } from "../components/customBlocks";
import type { GraphSnapshot } from "../patch/format";
import { WidgetBridge } from "./widgets/WidgetBridge";
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
  /** Convert a viewport (client) point to editor world coordinates (for drops). */
  screenToWorld(clientX: number, clientY: number): { x: number; y: number };
  removeSelected(): Promise<void>;
  duplicateSelected(): Promise<void>;
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

  AreaExtensions.selectableNodes(area, AreaExtensions.selector(), {
    accumulating: AreaExtensions.accumulateOnCtrl(),
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

  const addComponent: EditorHandle["addComponent"] = async (def, position) => {
    const node = new DspNode(def, (nodeId, value) => {
      AudioGraph.setValue(nodeId, value);
      notifyChange();
    });
    await editor.addNode(node);

    AudioGraph.setNode(node.id, def.id);
    if (def.kind === "constant") AudioGraph.setValue(node.id, def.value ?? 0);

    const pos = position ?? {
      x: 100 + (spawnOffset % 4) * 240,
      y: 80 + Math.floor(spawnOffset / 4) * 200 + (spawnOffset % 2) * 30,
    };
    spawnOffset++;
    await area.translate(node.id, pos);
    return node;
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
      return {
        id: n.id,
        componentId: n.componentId,
        position: view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 },
        value: valueCtrl ? Number(valueCtrl.value) : undefined,
        size:
          isWidget && n.width != null && n.height != null
            ? { w: n.width, h: n.height }
            : undefined,
        state: isWidget && hasState ? { ...n.widgetState } : undefined,
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
      const def = resolveComponent(n.componentId);
      if (!def) {
        console.warn(`Unknown component "${n.componentId}" in snapshot — skipped`);
        continue;
      }
      const node = await addComponent(def, n.position);
      idMap.set(n.id, node.id);
      if (def.kind === "constant" && typeof n.value === "number") {
        const ctrl = node.controls.value as ClassicPreset.InputControl<"number">;
        ctrl?.setValue(n.value);
        AudioGraph.setValue(node.id, n.value);
      }
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

  const duplicateSelected: EditorHandle["duplicateSelected"] = async () => {
    const selected = (editor.getNodes() as DspNode[]).filter((n) => (n as any).selected);
    for (const node of selected) {
      const def = resolveComponent(node.componentId);
      if (!def) continue;
      const view = area.nodeViews.get(node.id);
      const pos = view
        ? { x: view.position.x + 40, y: view.position.y + 40 }
        : undefined;
      const copy = await addComponent(def, pos);
      const srcCtrl = node.controls.value as ClassicPreset.InputControl<"number"> | undefined;
      if (def.kind === "constant" && srcCtrl) {
        const dstCtrl = copy.controls.value as ClassicPreset.InputControl<"number">;
        dstCtrl?.setValue(Number(srcCtrl.value));
        AudioGraph.setValue(copy.id, Number(srcCtrl.value));
        await area.update("node", copy.id);
      }
    }
    notifyChange();
  };

  const selectAll: EditorHandle["selectAll"] = async () => {
    for (const node of editor.getNodes()) {
      (node as any).selected = true;
      await area.update("node", node.id);
    }
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

  const destroy = () => area.destroy();

  return {
    addComponent,
    screenToWorld,
    removeSelected,
    duplicateSelected,
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
