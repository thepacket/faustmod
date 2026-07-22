/** A small metallic socket disc. Positioning/edge-alignment is handled in theme.css.
 *  No `title` here: the socket type ("audio") would otherwise override the port row's
 *  tooltip (label / default / range) when hovering the connector directly. */
export function ThemedSocket() {
  return <div className="dsp-socket" />;
}
