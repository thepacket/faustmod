# Third-Party Notices

FaustMod's own source code is licensed under the GNU General Public License
v3.0 or later (see `LICENSE`). The distributed application also bundles the
third-party packages and library functions listed below, each under its own
license. This file is provided to satisfy their attribution and notice
requirements.

## LGPL-3.0 components (weak copyleft)

One runtime dependency is licensed under the **GNU Lesser General Public
License v3.0 (LGPL-3.0)**. The combined, distributed work carries these
obligations for **this component only**: its copyright and license notices are
preserved (this file),
its source is available at the link below, and a user is free to obtain,
modify, and substitute their own build of the library. FaustMod uses the
package **unmodified**, as published on npm.

| Package | Purpose | License | Source |
| --- | --- | --- | --- |
| `@grame/faustwasm` | libfaust — the Faust compiler, in-browser (Faust → WebAssembly AudioWorklet) | LGPL-3.0 | https://github.com/grame-cncm/faustwasm · libfaust: https://github.com/grame-cncm/faust |

The full text of the LGPL-3.0 is available at
https://www.gnu.org/licenses/lgpl-3.0.txt (and within the package on npm).

**Note on the Faust compiler:** code *generated* by the Faust compiler (i.e. the
DSP a user writes and compiles in FaustMod) is not covered by the compiler's
license; it belongs to its author.

## MIT components

All other runtime dependencies are under the MIT License:

- `react`, `react-dom` — https://github.com/facebook/react
- `rete`, `rete-area-plugin`, `rete-connection-plugin`, `rete-comment-plugin`,
  `rete-history-plugin`, `rete-react-plugin`, `rete-render-utils` — https://github.com/retejs
- `codemirror`, `@codemirror/*`, `@lezer/highlight` — https://github.com/codemirror
- `styled-components` — https://github.com/styled-components/styled-components

Build-time tooling (Vite, TypeScript, ESLint, etc.) is not distributed in the
shipped application and is omitted here.

## Faust standard libraries (compiled into the block catalog)

Each block in FaustMod's palette is compiled at build time from a Faust
expression, and most call a function from the Faust standard libraries
(https://github.com/grame-cncm/faustlibraries). Those functions carry
**per-function** license declarations — the `declare <name> license "…"` line in
the corresponding `.lib` file. The majority are permissive (MIT-style STK-4.3,
MIT, BSD, ISC).

**These blocks are built from GPLv3-licensed functions**, which is why FaustMod
as a whole is distributed under the GPL:

| Block | Function | Author / license |
| --- | --- | --- |
| Expander (full), Expander (sidechain) | `co.expander_N_chan`, `co.expanderSC_N_chan` | Dario Sanfilippo — GPLv3 |
| Compressor (feed-fwd), Compressor (feed-fwd, st), Compressor (feedback) | `co.FFcompressor_N_chan`, `co.FBcompressor_N_chan` | Dario Sanfilippo — GPLv3 |
| Compression Gain (dB) | `co.peak_compression_gain_mono_db` | Dario Sanfilippo — GPLv3 |
| Limiter (lookahead), Limiter (lookahead, st) | `co.limiter_lad_mono`, `co.limiter_lad_stereo` | Dario Sanfilippo — GPLv3 |
| Vital Reverb | `re.vital_rev` | GPL-3.0 |
| Keith Barr Reverb | `re.kb_rom_rev1` | GPL-3.0 |

The libraries also contain AGPL-3.0 and GPL2+ functions; none are reachable from
the current catalog. Before adding a block, check the `declare … license` line of
every function its body calls.

## Example DSP

Any bundled example `.dsp` code carries its own per-file license declaration.
