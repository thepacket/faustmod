/**
 * Small bridge so widget node bodies (rendered by rete's React plugin, with no
 * access to the editor/area) can ask the editor to re-measure a node after a resize,
 * mark the patch dirty, and read the current zoom (to scale resize deltas).
 * createEditor wires these up.
 */
export const WidgetBridge: {
  updateNode: (nodeId: string) => void;
  onChange: () => void;
  zoom: () => number;
} = {
  updateNode: () => {},
  onChange: () => {},
  zoom: () => 1,
};

/** Shape a widget body reads from its rete node. */
export interface WidgetNode {
  id: string;
  widget?: string;
  widgetConfig?: Record<string, unknown>;
  widgetState: Record<string, unknown>;
  width?: number;
  height?: number;
}
