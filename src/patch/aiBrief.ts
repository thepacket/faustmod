import { LibraryService } from "../components/LibraryService";
import { CustomBlocks } from "../components/customBlocks";
import { PATCH_FORMAT, PATCH_VERSION, BLOCK_FORMAT } from "./format";
import type { ComponentDef } from "../components/library";

/** One catalog line: id, title, category, and every port with defaults/ranges/units. */
function describe(c: ComponentDef): string {
  const ins =
    c.inputs
      .map((s, i) => {
        const d = s.default !== undefined ? `=${s.default}` : "";
        const rng = s.min !== undefined ? `(${s.min}..${s.max})` : "";
        const unit = s.unit ? ` ${s.unit}` : "";
        return `in-${i}:${s.label || "in"}${d}${rng}${unit}`;
      })
      .join(", ") || "none";
  const outs = c.outputs.map((s, i) => `out-${i}:${s.label || "value"}`).join(", ") || "none";
  return `- ${c.id} — ${c.title} [${c.category}]  in:[${ins}]  out:[${outs}]`;
}

/**
 * Builds a self-contained brief to paste into an external AI (e.g. a chat with a
 * subscription), so it can generate FaustMod patches/blocks without the app paying
 * per-token costs. Includes the file formats, the DSP-block catalog, the control /
 * instrument widget nodes, and any of your own custom modules.
 */
export function buildAiBrief(): string {
  const comps = LibraryService.components;
  const faust = comps
    .filter((c) => c.kind === "faust")
    .map(describe)
    .join("\n");
  // Widget nodes: controls emit values; instruments/meters are sinks. Skip Comment (a note).
  const widgets = comps
    .filter((c) => c.kind === "widget" && c.id !== "comment")
    .map(describe)
    .join("\n");
  const userMods = CustomBlocks.all();
  const userSection = userMods.length
    ? `\n== Your custom modules (My Modules) ==\n${userMods.map(describe).join("\n")}\n`
    : "";

  return `You are helping build patches for FaustMod, a modular audio synthesis IDE.
DSP blocks are Faust; parameters are AUDIO-RATE control inputs (not knobs). An input
with a default (e.g. freq=220) uses that default when unconnected. To set or vary a value,
wire a source into that input: a "constant" node for a fixed value, or a control widget
(knob, slider-v/slider-h, xypad) for a settable one; sequencers/keyboard emit note data.
Every audible patch routes signal into the "output" node's in-0 (L) and in-1 (R).
"mono-to-stereo" duplicates a mono signal.

== Patch file format (.faustmod, JSON) ==
{
  "format": "${PATCH_FORMAT}", "version": ${PATCH_VERSION}, "name": "My Patch",
  "customBlocks": [ /* optional; see block format below, minus "format" */ ],
  "nodes": [
    { "id": "osc1", "componentId": "<catalog id or custom block id>", "position": {"x":0,"y":0} },
    { "id": "k1", "componentId": "constant", "position": {"x":-200,"y":0}, "value": 440 },
    { "id": "out", "componentId": "output", "position": {"x":400,"y":0} }
  ],
  "connections": [
    { "id": "c1", "source": "k1", "sourceOutput": "out-0", "target": "osc1", "targetInput": "in-0" }
  ]
}

== Custom block format (paste into "Import Block") ==
{
  "format": "${BLOCK_FORMAT}", "title": "My Filter", "category": "Custom",
  "inputs": [ {"label":"in"}, {"label":"cutoff","default":1000,"min":20,"max":20000,"unit":"Hz"} ],
  "outputs": [ {"label":"out"} ],
  "code": "import(\\"stdfaust.lib\\"); process(x, cutoff) = x : fi.lowpass(2, cutoff);"
}
Rules for blocks: the Faust process() takes its control values as named signal inputs, in
the SAME order as "inputs". Signal inputs have no default; control inputs do. The number
of process outputs must equal "outputs".length. Author modules as PROCESSING units — put
UI (sliders/knobs) in the patch as separate nodes, not inside the Faust code.

== Control & instrument nodes (widgets) ==
Sources: knob/slider-v/slider-h emit out-0 (a value); keyboard/midi-in emit freq+gate(+vel);
seq8/seq16 advance on their clock input and emit freq+gate+vel; xypad emits x+y; sampler/
granular emit stereo L/R (need an audio file loaded in-app). Sinks (no outputs): scope,
spectrum, spectrogram, tuner, freqmeter, meters and LEDs — wire a signal in to monitor it.
${widgets}
${userSection}
== Built-in blocks (id — title [category]  inputs  outputs) ==
special: constant (value node), output (stereo speakers, in-0/in-1), input (stereo mic, out-0/out-1)
${faust}
`;
}
