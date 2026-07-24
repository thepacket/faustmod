# Third-Party Notices

FaustMod's own source code is licensed under the MIT License (see `LICENSE`).
The distributed application also bundles the third-party packages listed below,
each under its own license. This file is provided to satisfy their attribution
and notice requirements.

## LGPL-3.0 components (weak copyleft)

Two runtime dependencies are licensed under the **GNU Lesser General Public
License v3.0 (LGPL-3.0)**. Using them does not change FaustMod's own MIT license,
but the combined, distributed work carries these obligations for **these
components only**: their copyright and license notices are preserved (this file),
their source is available at the links below, and a user is free to obtain,
modify, and substitute their own build of the library. FaustMod uses both
packages **unmodified**, as published on npm.

| Package | Purpose | License | Source |
| --- | --- | --- | --- |
| `@grame/faustwasm` | libfaust — the Faust compiler, in-browser (Faust → WebAssembly AudioWorklet) | LGPL-3.0 | https://github.com/grame-cncm/faustwasm · libfaust: https://github.com/grame-cncm/faust |
| `webpd` | Pure Data → JavaScript/WASM audio engine | LGPL-3.0 | https://github.com/sebpiq/WebPd |

The full text of the LGPL-3.0 is available at
https://www.gnu.org/licenses/lgpl-3.0.txt (and within each package on npm).

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

## Faust libraries & example DSP

Faust standard-library functions and any bundled example `.dsp` code carry their
own per-file license declarations (visible in each block's source). Most are
permissive (STK-4.3 / BSD / MIT-style); a few functions may be under other terms.
Refer to the `declare license` line of a given block for its specific license.
