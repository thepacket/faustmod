/**
 * Bridge so a module node (rendered by rete's React plugin) can ask the app to open
 * the floating Faust source editor for it. App wires `open`; ThemedNode calls it on
 * a double-click of a module node.
 */
export const ModuleEditBridge: { open: (nodeId: string) => void } = {
  open: () => {},
};
