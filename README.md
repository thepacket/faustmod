# FaustMod

A browser-based **modular audio synthesis IDE**. Patch DSP components together on a
node canvas, hear the result live, author your own DSP blocks, and save/open patches.
DSP is written in the [Faust](https://faust.grame.fr/) language and runs as WebAssembly
AudioWorklets in the browser.

## Stack

- **React + Vite + TypeScript** — app shell and tooling
- **[rete.js v2](https://retejs.org/)** (React renderer) — the node editor
- **[@grame/faustwasm](https://github.com/grame-cncm/faustwasm)** — in-browser Faust → WASM AudioWorklet compiler
- **Web Audio API** — routing, mixing, stereo I/O

## Features

- **~400 built-in DSP blocks** (oscillators, filters, EQ, delays, reverbs, envelopes,
  dynamics, distortion, modulation, math, routing…), searchable palette.
- **Instrument/widget nodes** — oscilloscope (signal + trigger, resizable), spectrogram
  (resizable), analog VU meter, digital voltmeter, R/G/B/Y LEDs, and 8/16-step
  sequencers (clock in → step frequency out, drag steps to set pitch).
- **Custom blocks** — paste Faust source (with port metadata), compiled in-browser and
  added to the palette. See *Custom DSP blocks* below.
- **Multiple tabs** — one patch per tab; only the active tab plays.
- **Recording + devices** — record the master output (Rec button → `.webm`); pick audio
  input/output devices (Help → Audio Devices).
- **File management** — a top menu (File / Edit / View / Block / Help) with New, Open,
  Save, Save As, Export, undo/redo, and the `.faustmod` patch format.
- **Bring-your-own-AI** — instead of an LLM baked into the app, use an external AI to
  write blocks/patches and paste them in. See *Using an external AI* below.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
```

Click a component in the left panel to add it, drag between sockets to patch, then
**Start**. Use the **File** menu to save/open `.faustmod` patches, **Block → Import DSP
Block…** to add your own Faust blocks, and **Help → Copy Catalog for AI** to drive an
external AI.

### Building the block catalog

The DSP blocks are **precompiled at build time** into WASM factories. These artifacts —
`public/factories/` and `src/generated/catalog.json` — are **generated, not committed**
(they're in `.gitignore`), so a fresh clone must build them before the app can load any
blocks:

```bash
npm run catalog            # compile all blocks → public/factories/ + src/generated/catalog.json
npm run catalog -- --force # force a full rebuild (skips the up-to-date check)
```

You normally don't run this by hand — it's wired to run automatically:

- **`npm run dev`** → `predev` runs `npm run catalog`
- **`npm run build`** → `prebuild` runs `npm run catalog`

The step **skips when already fresh** (catalog newer than `scripts/blocks.mjs`), so it
only pays the compile cost when the block definitions change. Requires no external tools —
libfaust runs in Node via `@grame/faustwasm`. See
[Block catalog & precompiled factories](#block-catalog--precompiled-factories-scaling)
for how it works and how to add blocks.

## Architecture

The **audio engine** (`src/audio/`) is deliberately decoupled from the **editor**
(`src/editor/`):

| Layer | Responsibility |
|-------|----------------|
| `FaustService` | Loads precompiled block factories (`createFactoryNode`) with no compiler; also owns libfaust for future user-authored DSP. |
| `AudioEngine` | Owns the `AudioContext` and master gain → speakers. Created lazily on first user gesture. |
| `AudioGraph` | Holds the *desired* graph (nodes, connections, params). While "live", mirrors it into real Web Audio nodes. |
| `units.ts` | `FaustUnit` / `ConstantUnit` / `OutputUnit` / `InputUnit` — each exposes Faust channels as individual mono ports via `ChannelSplitter`/`ChannelMerger`; `FaustUnit` also manages the fallback default sources for control inputs. |

Each Faust component runs as **its own AudioWorklet** (instantiated from a precompiled
factory); a rete connection becomes a `splitter.connect(merger, srcCh, dstCh)` call. The editor pushes every change
(`nodecreated`, `connectioncreated`, param edits…) into `AudioGraph`, so playback stays
in sync with the canvas whether or not audio is currently running.

Component metadata (ports, defaults) is declared up front and loaded from the generated
`catalog.json`, so the editor knows each node's sockets and parameters instantly — no
compilation happens at startup (see below).

## Block catalog & precompiled factories (scaling)

The built-in library is **hundreds of DSP blocks**, and it must not slow startup.
So blocks are **precompiled at build time**, never in the browser:

- `scripts/blocks.mjs` declares candidate blocks as families of Faust functions.
- `npm run catalog` (run automatically by `prebuild`) compiles each one **once in
  Node** with libfaust, emits a tiny `public/factories/<id>.wasm` (~2 KB) + `<id>.json`
  per block, and writes `src/generated/catalog.json` with all the metadata. Blocks that
  fail to compile — or whose real I/O count doesn't match — are **pruned**, so the
  shipped catalog is always valid.
- At runtime the UI imports `catalog.json` (bundled, parsed instantly) and renders the
  palette. **No libfaust, no compilation at startup** — the UI is interactive immediately.
- A block's factory is fetched lazily (`FaustService.createFactoryNode`) only when a node
  of that type is first placed/played: `fetch` ~2 KB wasm → `WebAssembly.compile` → node.

libfaust (the ~3 MB compiler) is only ever loaded for future *programmable* nodes
(user-authored DSP), not for the built-in library.

To add blocks: extend the families in `scripts/blocks.mjs` and run `npm run catalog`.
The palette, audio graph, and AI all scale to the new count with no other changes.

## The node model: control inputs, not knobs

Nodes have **input ports and output ports only** — there are no inline parameter knobs.
Every parameter is an **audio-rate control input**. `process(freq, gain) = ...` declares
two control inputs; wiring a signal into one modulates that parameter sample-by-sample.

- An input with a `default` (e.g. `freq = 220`) is a **control input**. When nothing is
  connected, an internal `ConstantSourceNode(default)` drives it. Connecting a node
  detaches the default so the incoming signal takes over.
- An input without a default is a **signal input** (silent when unconnected).
- The **Constant** node is the only node with an editable value; it's how you set a
  specific frequency, cutoff, gain, etc. — wire `Constant(440) → freq`.

This means an LFO into a filter's `cutoff`, or an envelope into a VCA's `gain`, is just a
normal connection.

## Adding a component

Add an entry to `LIBRARY` in [`src/components/library.ts`](src/components/library.ts).
Declare the ports and write `process` so its control values are named signal inputs:

```ts
{
  id: "tremolo", title: "Tremolo", category: "Dynamics", kind: "faust",
  tooltip: "Amplitude modulation — periodic volume wobble.",   // node header tooltip
  inputs: [
    { label: "in", tooltip: "Signal to modulate." },           // signal input
    { label: "rate", default: 5, min: 0.1, max: 20, unit: "Hz", tooltip: "Wobble speed." },
    { label: "depth", default: 0.5, min: 0, max: 1, tooltip: "Wobble amount." },
  ],
  outputs: [{ label: "out", tooltip: "Modulated signal." }],
  code: `
import("stdfaust.lib");
process(x, rate, depth) = x * (1 - depth * (0.5 + 0.5 * os.osc(rate)));
`,
},
```

At startup every Faust component is compiled once and its actual input/output count is
checked against the declared ports (a mismatch logs a warning).

**Documenting ports:** the `tooltip` field on a component, an `InputSpec`, or an
`OutputSpec` is how you document what each node/port does. On hover, the node header and
each port show a tooltip combining your text with auto-generated facts (default value,
range, unit, whether it's a control or signal input). Nodes shrink-wrap their content, so
they vary in size and add ports without wasted space.

## Theme

The editor's dark 3D-metallic look (glowing category-accented headers, beveled node
bodies, pill controls, signal cables, line grid) lives in
[`src/editor/theme/`](src/editor/theme/) and is applied through rete-react-plugin's
`customize` hooks (`ThemedNode`, `ThemedSocket`) plus `theme.css`. Header accents are set
per category in [`accents.ts`](src/editor/theme/accents.ts).

## Custom DSP blocks

**Block → Import DSP Block…** takes a self-describing block definition — Faust source plus
the port metadata the control-input model needs (labels + defaults). It's compiled
in-browser with libfaust to verify (and to read the I/O count), then added to the palette
under its category and persisted in `localStorage`:

```json
{
  "format": "faustmod-block",
  "title": "My Lowpass", "category": "Custom",
  "inputs": [ {"label":"in"}, {"label":"cutoff","default":1000,"min":20,"max":20000,"unit":"Hz"} ],
  "outputs": [ {"label":"out"} ],
  "code": "import(\"stdfaust.lib\"); process(x, cutoff) = x : fi.lowpass(2, cutoff);"
}
```

`process()` takes its control values as **named signal inputs in the same order as
`inputs`** (this is the audio-rate control-input model — see above). Custom blocks are
compiled at runtime; built-in blocks load precompiled factories.

## Patches & file format

Patches save as `.faustmod` (JSON): metadata, `nodes`, `connections`, and any **custom
blocks embedded** so a patch is self-contained. Save/Open use the File System Access API
(with download/upload fallback). See [`src/patch/format.ts`](src/patch/format.ts).

## Using an external AI

Rather than pay per-token for an in-app LLM (which would need the whole ~400-block catalog
in context), FaustMod is **bring-your-own-AI**: **Help → Copy Catalog for AI** copies a
brief (file formats + the full component catalog) to your clipboard. Paste it into an
external AI, ask for a patch or a DSP block, and paste the result back via **Open** (patch)
or **Block → Import DSP Block…**. Patches that use custom blocks are self-contained, so the
AI can write those without any catalog at all.

## Project layout

```
src/
  audio/        FaustService, AudioEngine, AudioGraph, units, monitors (widgets),
                devices, types
  components/   library, widgets, LibraryService, customBlocks (registry)
  editor/       rete editor setup + DspNode + theme/ + widgets/ (React bodies)
  patch/        format (.faustmod), PatchManager (file I/O), TabsManager, aiBrief
  ui/           App, MenuBar, TabBar, LibraryPanel, modals, styles
```

## Widget nodes

Instrument nodes (scope, meters, LEDs, sequencer…) are `kind: "widget"` components
(`src/components/widgets.ts`). Each realizes into a custom audio unit in
`src/audio/monitors.ts` (an AnalyserNode tap, or the sequencer's AudioWorklet) that
registers in a `Monitors` map keyed by node id. The matching React body in
`src/editor/widgets/` reads that map each frame to animate. Resizable widgets persist
their size (and the sequencer its notes) in the patch.
