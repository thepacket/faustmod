# Pd example modules

Small Pure Data DSP patches that load as **Pd DSP** modules in FaustMod
(**User Defined DSP → Pd DSP → + New Pd DSP**). They run in the browser via
[WebPd](https://github.com/sebpiq/WebPd) — no Pd install, no server.

## Conventions used here

FaustMod runs a Pd patch's audio through `adc~` (inputs) and `dac~` (outputs)
— **not** `inlet~`/`outlet~`, which WebPd doesn't expose as worklet channels.
So each module:

- reads its inputs from `adc~ 1`, `adc~ 2`, … (one FaustMod input **port** per
  channel — audio *and* parameters), and writes its output to `dac~ 1` (mono)
  or `dac~` (stereo);
- declares metadata in Pd **comments** (Pd has no native port names/ranges):

  | Comment | Meaning |
  |---|---|
  | `@name Lowpass` | module display name |
  | `@desc One-pole lowpass filter.` | node tooltip |
  | `@in audio cutoff` | input port names (channel order) |
  | `@out out` | output port names |
  | `@param cutoff 1000 20 12000` | make that input a control input: `default min max` |

A `@param` input holds its default until you wire something in; right-click it
→ **Add Knob** gives a correctly scaled knob (e.g. 20 Hz–12 kHz).

## Modules

| File | What it does | Ports |
|---|---|---|
| `gain.pd` | VCA — multiply by a gain | audio, gain → out |
| `lowpass.pd` | one-pole lowpass | audio, cutoff → out |
| `tremolo.pd` | sine-LFO amplitude modulation | audio, rate → out |
| `ringmod.pd` | ring modulation (sine carrier) | audio, freq → out |
| `drive.pd` | gain into a hard clip (distortion) | audio, drive → out |
| `sineosc.pd` | sine oscillator (generator) | freq → out |
| `noise.pd` | white-noise generator | → out |

> WebPd runs a **vanilla subset** of Pd (`webpd --whats-implemented`); ELSE and
> other externals are not available. Output is stereo max; inputs can be many.
