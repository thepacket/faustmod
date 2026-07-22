/**
 * Bridge so the canvas / node renderer (rete-hosted React) can ask the app to open a
 * contextual menu at a screen point. App wires `open`; ThemedNode calls it on a
 * right-click of an input port (carrying the target), and the canvas calls it with no
 * target for empty-space right-clicks.
 */
export interface ContextMenuTarget {
  /** Screen coordinates where the menu should appear. */
  x: number;
  y: number;
  /** When the right-click landed on a node input port, the node + socket key. */
  nodeId?: string;
  inputKey?: string;
  /** Label of the input (for the menu wording). */
  inputLabel?: string;
  /** Right-click on the node title: the action applies to ALL of the node's inputs. */
  allInputs?: boolean;
}

export const ContextMenuBridge: { open: (target: ContextMenuTarget) => void } = {
  open: () => {},
};
