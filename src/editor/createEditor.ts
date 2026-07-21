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
import { createRoot } from "react-dom/client";

import { DspNode, indexFromKey } from "./DspNode";
import { ThemedNode } from "./theme/ThemedNode";
import { ThemedSocket } from "./theme/ThemedSocket";
import { AudioGraph } from "../audio/AudioGraph";
import { LIBRARY_BY_ID, type ComponentDef } from "../components/library";
import "./theme/theme.css";

// rete presets require the base ClassicPreset.Node as the scheme's node type;
// DspNode is used at runtime as a subclass and cast back where its fields are needed.
type Node = ClassicPreset.Node;
type Conn = ClassicPreset.Connection<Node, Node>;
type Schemes = GetSchemes<Node, Conn>;
type AreaExtra = ReactArea2D<Schemes>;

/** Serializable snapshot of the patch — used for persistence and AI round-trips. */
export interface GraphSnapshot {
  nodes: {
    id: string;
    componentId: string;
    position: { x: number; y: number };
    /** Only present for Constant nodes. */
    value?: number;
  }[];
  connections: {
    id: string;
    source: string;
    sourceOutput: string;
    target: string;
    targetInput: string;
  }[];
}

export interface EditorHandle {
  addComponent(def: ComponentDef, position?: { x: number; y: number }): Promise<DspNode>;
  removeSelected(): Promise<void>;
  clear(): Promise<void>;
  snapshot(): GraphSnapshot;
  load(snapshot: GraphSnapshot): Promise<void>;
  zoomToFit(): Promise<void>;
  destroy(): void;
}

export async function createEditor(container: HTMLElement): Promise<EditorHandle> {
  const editor = new NodeEditor<Schemes>();
  const area = new AreaPlugin<Schemes, AreaExtra>(container);
  const connection = new ConnectionPlugin<Schemes, AreaExtra>();
  const render = new ReactPlugin<Schemes, AreaExtra>({ createRoot });

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

  editor.use(area);
  area.use(connection);
  area.use(render);

  AreaExtensions.simpleNodesOrder(area);

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
    } else if (ctx.type === "connectionremoved") {
      void AudioGraph.removeConn(ctx.data.id);
    } else if (ctx.type === "noderemoved") {
      void AudioGraph.removeNode(ctx.data.id);
    }
    return ctx;
  });

  let spawnOffset = 0;

  const addComponent: EditorHandle["addComponent"] = async (def, position) => {
    const node = new DspNode(def, (nodeId, value) => AudioGraph.setValue(nodeId, value));
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
      return {
        id: n.id,
        componentId: n.componentId,
        position: view ? { x: view.position.x, y: view.position.y } : { x: 0, y: 0 },
        value: valueCtrl ? Number(valueCtrl.value) : undefined,
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
      const def = LIBRARY_BY_ID.get(n.componentId);
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
    await zoomToFit();
  };

  const zoomToFit: EditorHandle["zoomToFit"] = async () => {
    await AreaExtensions.zoomAt(area, editor.getNodes());
  };

  const destroy = () => area.destroy();

  return {
    addComponent,
    removeSelected,
    clear,
    snapshot,
    load,
    zoomToFit,
    destroy,
  };
}
