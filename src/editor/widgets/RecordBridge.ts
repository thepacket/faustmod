/**
 * Bridge so the Record widget node (rendered by rete's React plugin) can drive the
 * app-level recorder. App wires `set`; the widget calls it when its "on" input crosses
 * 0 (non-zero → record, 0 → stop).
 */
export const RecordBridge: { set: (on: boolean) => void } = {
  set: () => {},
};
