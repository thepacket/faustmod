import type { ClassicPreset } from "rete";

/** A small metallic socket disc. Positioning/edge-alignment is handled in theme.css. */
export function ThemedSocket(props: { data: ClassicPreset.Socket }) {
  return <div className="dsp-socket" title={props.data.name} />;
}
