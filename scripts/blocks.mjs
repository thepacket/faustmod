// Candidate DSP block catalog. Each block is compiled at build time; any that
// fail to compile are pruned (see build-catalog.mjs), so it's safe to be liberal.
//
// A block: { id, title, category, args, body }
//   args: Faust process arguments IN ORDER. A signal input has no `default`;
//         a control input has a numeric `default` (+ optional min/max/unit).
//   body: the Faust expression for `process(<args>) = <body>;`
//         (import("stdfaust.lib") is prepended automatically).

const sig = (name, label = name) => ({ name, label });
const ctl = (name, label, def, min, max, unit) => ({ name, label, default: def, min, max, unit });

const blocks = [];
const B = (id, title, category, args, body, tooltip) =>
  blocks.push({ id, title, category, args, body, ...(tooltip ? { tooltip } : {}) });

// Band-limited (DPW) oscillators synthesise their shape by differentiating a polynomial,
// so their amplitude scales with frequency and collapses below roughly 20 Hz — measured
// at 0.7 Hz, os.triangle/os.square/os.pulsetrain output under 5% of full scale. Say so on
// the blocks rather than leaving people to discover a silent LFO.
const BL_NOTE = "Band-limited: output collapses below ~20 Hz. Use the LFO variants for modulation rates.";

// ------------------------------------------------------------------ Oscillators
const FREQ = () => ctl("freq", "freq", 220, 20, 20000, "Hz");
const GAIN = (d = 0.5) => ctl("gain", "gain", d, 0, 1);
for (const [fn, title] of [
  ["osc", "Sine Osc"],
  ["oscsin", "Sine (table)"],
  ["osccos", "Cosine"],
  ["sawtooth", "Saw Osc"],
  ["square", "Square Osc"],
  ["triangle", "Triangle Osc"],
]) {
  const bandLimited = fn === "square" || fn === "triangle";
  B(`os-${fn}`, title, "Oscillators", [FREQ(), GAIN()], `os.${fn}(freq) * gain`,
    bandLimited ? BL_NOTE : undefined);
}
B("os-pulsetrainpos", "Pulse Train (0..1)", "Oscillators",
  [FREQ(), ctl("duty", "duty", 0.5, 0, 1), GAIN(1)], "os.lf_pulsetrainpos(freq, duty) * gain");
B("os-sawtoothpos", "Saw (0..1)", "Oscillators", [FREQ(), GAIN(1)],
  "(os.sawtooth(freq)*0.5 + 0.5) * gain");
B("os-pulsetrain", "Pulse Train (duty)", "Oscillators",
  [FREQ(), ctl("duty", "duty", 0.5, 0, 1), GAIN()], "os.pulsetrain(freq, duty) * gain", BL_NOTE);
for (const [fn, title] of [
  ["lf_saw", "LFO Saw"],
  ["lf_triangle", "LFO Triangle"],
  ["lf_squarewave", "LFO Square"],
  ["lf_imptrain", "Impulse Train"],
]) {
  B(`os-${fn}`, title, "Oscillators", [ctl("rate", "rate", 2, 0.01, 100, "Hz")], `os.${fn}(rate)`);
}
B("os-phasor", "Phasor (0..1)", "Oscillators", [FREQ()], "os.phasor(1.0, freq)");
B("os-lf-sawpos", "LFO Ramp", "Oscillators", [ctl("rate", "rate", 1, 0.01, 100, "Hz")], "os.lf_sawpos(rate)");

// ------------------------------------------------------------------ Noise
B("no-white", "White Noise", "Noise", [GAIN(0.3)], "no.noise * gain");
B("no-pink", "Pink Noise", "Noise", [GAIN(0.3)], "no.pink_noise * gain");
B("no-multirandom", "Random", "Noise", [], "no.multirandom(2) : _, !");
B("no-lfnoise0", "LF Noise (S/H)", "Noise", [ctl("rate", "rate", 10, 0.1, 5000, "Hz")], "no.lfnoise0(rate)");
B("no-lfnoise", "LF Noise (smooth)", "Noise", [ctl("rate", "rate", 10, 0.1, 5000, "Hz")], "no.lfnoise(rate)");
B("no-sparse", "Sparse Noise", "Noise", [ctl("density", "density", 1000, 1, 20000)], "no.sparse_noise(density)");

// ------------------------------------------------------------------ Filters
const CUT = (d = 1000) => ctl("cutoff", "cutoff", d, 20, 20000, "Hz");
for (const N of [1, 2, 3, 4]) {
  B(`fi-lowpass-${N}`, `Lowpass ${N}p`, "Filters", [sig("x", "in"), CUT()], `x : fi.lowpass(${N}, cutoff)`);
  B(`fi-highpass-${N}`, `Highpass ${N}p`, "Filters", [sig("x", "in"), CUT(300)], `x : fi.highpass(${N}, cutoff)`);
}
for (const N of [1, 2]) {
  B(`fi-bandpass-${N}`, `Bandpass ${N}`, "Filters",
    [sig("x", "in"), ctl("fl", "low", 300, 20, 20000, "Hz"), ctl("fh", "high", 3000, 20, 20000, "Hz")],
    `x : fi.bandpass(${N}, fl, fh)`);
  B(`fi-bandstop-${N}`, `Bandstop ${N}`, "Filters",
    [sig("x", "in"), ctl("fl", "low", 300, 20, 20000, "Hz"), ctl("fh", "high", 3000, 20, 20000, "Hz")],
    `x : fi.bandstop(${N}, fl, fh)`);
}
B("fi-resonlp", "Resonant LP", "Filters", [sig("x", "in"), CUT(), ctl("q", "q", 5, 0.5, 30)], "x : fi.resonlp(cutoff, q, 1.0)");
B("fi-resonhp", "Resonant HP", "Filters", [sig("x", "in"), CUT(), ctl("q", "q", 5, 0.5, 30)], "x : fi.resonhp(cutoff, q, 1.0)");
B("fi-resonbp", "Resonant BP", "Filters", [sig("x", "in"), CUT(), ctl("q", "q", 5, 0.5, 30)], "x : fi.resonbp(cutoff, q, 1.0)");
B("fi-low-shelf", "Low Shelf", "Filters", [sig("x", "in"), ctl("g", "gain", 0, -24, 24, "dB"), CUT(200)], "x : fi.low_shelf(g, cutoff)");
B("fi-high-shelf", "High Shelf", "Filters", [sig("x", "in"), ctl("g", "gain", 0, -24, 24, "dB"), CUT(4000)], "x : fi.high_shelf(g, cutoff)");
B("fi-peak-eq", "Peak EQ", "Filters", [sig("x", "in"), ctl("g", "gain", 0, -24, 24, "dB"), CUT(), ctl("b", "bw", 100, 1, 5000, "Hz")], "x : fi.peak_eq(g, cutoff, b)");
B("fi-peak-eq-cq", "Peak EQ (Q)", "Filters", [sig("x", "in"), ctl("g", "gain", 0, -24, 24, "dB"), CUT(), ctl("q", "q", 2, 0.1, 30)], "x : fi.peak_eq_cq(g, cutoff, q)");
B("fi-notch", "Notch", "Filters", [sig("x", "in"), ctl("w", "width", 100, 1, 5000, "Hz"), CUT()], "x : fi.notchw(w, cutoff)");
B("fi-dcblocker", "DC Blocker", "Filters", [sig("x", "in")], "x : fi.dcblocker");
B("fi-pole", "One Pole", "Filters", [sig("x", "in"), ctl("p", "pole", 0.9, 0, 0.999)], "x : fi.pole(p)");
B("fi-zero", "One Zero", "Filters", [sig("x", "in"), ctl("z", "zero", 0.5, -1, 1)], "x : fi.zero(z)");
B("fi-lowpass6e", "Lowpass (elliptic)", "Filters", [sig("x", "in"), CUT()], "x : fi.lowpass6e(cutoff)");
B("fi-highpass6e", "Highpass (elliptic)", "Filters", [sig("x", "in"), CUT(300)], "x : fi.highpass6e(cutoff)");
B("fi-tone", "Tone Control", "Filters", [sig("x", "in"), ctl("low", "low", 0, -24, 24, "dB"), ctl("high", "high", 0, -24, 24, "dB")],
  "x : fi.low_shelf(low, 300) : fi.high_shelf(high, 3000)");
B("fi-fb-comb", "Comb (feedback)", "Filters", [sig("x", "in"), ctl("ms", "delay", 10, 0.1, 100, "ms"), ctl("fb", "feedback", 0.5, 0, 0.99)],
  "x : (+ ~ (@(max(1, ma.SR*ms/1000)) : *(fb)))");

// ------------------------------------------------------------------ Virtual analog
// The zero-delay-feedback filters in vaeffects.lib take a *normalised* cutoff in
// 0..1, not Hz — these were declared with a Hz cutoff port, which drove the
// feedback loop straight to NaN, so every one of them was silent with no error
// anywhere. normFreq is exponential and sample-rate independent: one unit spans
// ten octaves, cutoff ~ C * 2^(10*normFreq). C is measured per filter (its -3 dB
// corner at the block's default q, the peak for the bandpass) and is used only to
// document the knob and to place the default near 1 kHz.
const hz = (f) => (f >= 1000 ? `${(f / 1000).toFixed(f < 10000 ? 1 : 0)} kHz` : `${Math.round(f)} Hz`);
const VA_NOTE = (C) =>
  `Cutoff is normalised 0-1 and exponential (ten octaves): 0 ~ ${hz(C)}, 0.5 ~ ${hz(C * 32)}, ` +
  `1 ~ ${C * 1024 >= 20000 ? "past the top of the audio band" : hz(C * 1024)}.`;
const VA_Q = () => ctl("q", "q", 2, 0.5, 20);
const VA = (id, title, fn, C, q = VA_Q()) =>
  B(id, title, "Virtual Analog",
    [sig("x", "in"), ctl("nf", "cutoff", +(Math.log2(1000 / C) / 10).toFixed(2), 0, 1), q],
    `x : ve.${fn}(nf, q)`, VA_NOTE(C));

// moog_vcf is the one VA filter that really does take Hz, but it blows up above
// roughly SR/8 (measured: NaN at 6 kHz / 44.1 kHz), so its cutoff stops at 5 kHz.
B("ve-moog", "Moog VCF", "Virtual Analog", [sig("x", "in"), ctl("cutoff", "cutoff", 1000, 20, 5000, "Hz"), ctl("res", "res", 0.5, 0, 1)],
  "x : ve.moog_vcf(res, cutoff)", "Cutoff stops at 5 kHz — the circuit model diverges above about SR/8.");
VA("ve-moogladder", "Moog Ladder", "moogLadder", 11.651, ctl("q", "q", 2, 0.707, 25));
// korg35 self-destructs (NaN, and it never recovers) somewhere above q ~ 10.
VA("ve-korg35lpf", "Korg 35 LP", "korg35LPF", 15.616, ctl("q", "q", 2, 0.5, 10));
VA("ve-korg35hpf", "Korg 35 HP", "korg35HPF", 15.414, ctl("q", "q", 2, 0.5, 10));
VA("ve-diodeladder", "Diode Ladder", "diodeLadder", 5.518);
VA("ve-oberheim-bpf", "Oberheim BP", "oberheimBPF", 19.469);
VA("ve-oberheim-lpf", "Oberheim LP", "oberheimLPF", 24.442);
VA("ve-sallenkey-lpf", "Sallen-Key LP", "sallenKey2ndOrderLPF", 29.244);
VA("ve-sallenkey-hpf", "Sallen-Key HP", "sallenKey2ndOrderHPF", 13.307);

// ------------------------------------------------------------------ Delays
B("de-delay", "Delay (samples)", "Delay", [sig("x", "in"), ctl("n", "samples", 4800, 0, 96000)], "x : de.delay(96000, int(n))");
B("de-fdelay", "Delay (ms)", "Delay", [sig("x", "in"), ctl("ms", "time", 250, 0, 2000, "ms")], "x : de.fdelay(96000, ma.SR*ms/1000)");
B("de-echo", "Echo", "Delay", [sig("x", "in"), ctl("ms", "time", 250, 1, 2000, "ms"), ctl("fb", "feedback", 0.4, 0, 0.95)],
  "x : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb)))");
B("de-sdelay", "Smooth Delay", "Delay", [sig("x", "in"), ctl("ms", "time", 250, 0, 2000, "ms")], "x : de.sdelay(96000, 1024, ma.SR*ms/1000)");
B("de-pingpong", "Ping-Pong", "Delay",
  [sig("l", "L"), sig("r", "R"), ctl("ms", "time", 300, 1, 2000, "ms"), ctl("fb", "feedback", 0.4, 0, 0.9)],
  "(\\(fl, fr).(l + fr*fb, r + fl*fb)) ~ (de.fdelay(192000, ma.SR*ms/1000), de.fdelay(192000, ma.SR*ms/1000))");

// ------------------------------------------------------------------ Reverb
B("re-mono-freeverb", "Freeverb (mono)", "Reverb", [sig("x", "in"), ctl("room", "room", 0.6, 0, 1), ctl("damp", "damp", 0.5, 0, 1)], "x : re.mono_freeverb(room, damp, 0.5, 1)");
B("re-stereo-freeverb", "Freeverb (stereo)", "Reverb", [sig("l", "L"), sig("r", "R"), ctl("room", "room", 0.6, 0, 1), ctl("damp", "damp", 0.5, 0, 1)], "l, r : re.stereo_freeverb(room, room, damp, 1)");
B("re-jcrev", "JC Reverb", "Reverb", [sig("x", "in")], "x : re.jcrev");
B("re-satrev", "Sat Reverb", "Reverb", [sig("x", "in")], "x : re.satrev");
B("re-mono-fdn", "FDN Reverb", "Reverb", [sig("x", "in"), ctl("t60", "t60", 3, 0.1, 20, "s")],
  "x <: re.fdnrev0(2048, (778, 1601, 2451, 3307), 3, (200, 2000, 8000), (t60*1.2, t60, t60*0.7, t60*0.35), 1, 0) :> _*0.25");

// ------------------------------------------------------------------ Envelopes (gate is a signal input)
B("en-adsr", "ADSR", "Envelopes",
  [sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("d", "decay", 0.1, 0.001, 5, "s"), ctl("s", "sustain", 0.7, 0, 1), ctl("r", "release", 0.3, 0.001, 10, "s")],
  "en.adsr(a, d, s, r, gate)");
B("en-asr", "ASR", "Envelopes",
  [sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("s", "sustain", 0.7, 0, 1), ctl("r", "release", 0.3, 0.001, 10, "s")],
  "en.asr(a, s, r, gate)");
B("en-ar", "AR", "Envelopes",
  [sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("r", "release", 0.3, 0.001, 10, "s")],
  "en.ar(a, r, gate)");
B("en-smooth", "Smoother", "Envelopes", [sig("x", "in"), ctl("t", "time", 0.02, 0.001, 2, "s")], "x : si.smooth(ba.tau2pole(t))");

// ------------------------------------------------------------------ Dynamics
B("co-comp-mono", "Compressor", "Dynamics",
  [sig("x", "in"), ctl("ratio", "ratio", 4, 1, 20), ctl("thresh", "thresh", -20, -60, 0, "dB"), ctl("att", "attack", 0.01, 0.001, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s")],
  "x : co.compressor_mono(ratio, thresh, att, rel)");
B("co-comp-stereo", "Compressor (st)", "Dynamics",
  [sig("l", "L"), sig("r", "R"), ctl("ratio", "ratio", 4, 1, 20), ctl("thresh", "thresh", -20, -60, 0, "dB"), ctl("att", "attack", 0.01, 0.001, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s")],
  "(l, r) : co.compressor_stereo(ratio, thresh, att, rel)");
B("co-limiter", "Limiter 1176", "Dynamics", [sig("x", "in")], "x : co.limiter_1176_R4_mono");
B("ef-gate", "Noise Gate", "Dynamics",
  [sig("x", "in"), ctl("thresh", "thresh", -40, -90, 0, "dB"), ctl("att", "attack", 0.001, 0.0001, 0.5, "s"), ctl("hold", "hold", 0.1, 0, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s")],
  "x : ef.gate_mono(thresh, att, hold, rel)");

// ------------------------------------------------------------------ Distortion / shaping
B("ef-cubicnl", "Cubic Distort", "Distortion", [sig("x", "in"), ctl("drive", "drive", 0.5, 0, 1), ctl("offset", "offset", 0, -1, 1)], "x : ef.cubicnl(drive, offset)");
B("dist-tanh", "Tanh Saturate", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 50)], "ma.tanh(x * drive)");
B("dist-atan", "Atan Saturate", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 50)], "atan(x * drive) * (2/ma.PI)");
B("dist-clip", "Hard Clip", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 50)], "max(-1, min(1, x * drive))");
B("dist-cubic", "Cubic Soft Clip", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 20)], "(x*drive) - (x*drive)*(x*drive)*(x*drive)/3 : max(-0.66) : min(0.66)");
B("dist-fold", "Wavefolder", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 20)], "sin(x * drive * ma.PI)");
B("dist-bitcrush", "Bitcrusher", "Distortion", [sig("x", "in"), ctl("bits", "bits", 8, 1, 16)], "floor(x * pow(2, bits)) / pow(2, bits)");

// ------------------------------------------------------------------ Modulation effects
B("mod-tremolo", "Tremolo", "Modulation", [sig("x", "in"), ctl("rate", "rate", 5, 0.1, 20, "Hz"), ctl("depth", "depth", 0.5, 0, 1)], "x * (1 - depth * (0.5 + 0.5*os.osc(rate)))");
B("mod-flanger", "Flanger (fb)", "Modulation", [sig("x", "in"), ctl("rate", "rate", 0.5, 0.01, 10, "Hz"), ctl("depth", "depth", 0.5, 0, 1), ctl("fb", "feedback", 0.5, 0, 0.95)],
  "x : (+ ~ (de.fdelay(4096, max(1, ma.SR*(0.001 + 0.004*depth*(0.5+0.5*os.osc(rate))))) : *(fb)))");
B("mod-vibrato", "Vibrato", "Modulation", [sig("x", "in"), ctl("rate", "rate", 5, 0.1, 12, "Hz"), ctl("depth", "depth", 0.3, 0, 1)],
  "x : de.fdelay(4096, ma.SR*(0.002 + 0.002*depth*(0.5+0.5*os.osc(rate))))");
B("mod-ringmod", "Ring Mod", "Modulation", [sig("x", "in"), ctl("freq", "freq", 200, 1, 5000, "Hz")], "x * os.osc(freq)");

// ------------------------------------------------------------------ Spatial
B("sp-panner", "Panner", "Spatial", [sig("x", "in"), ctl("pan", "pan", 0.5, 0, 1)], "x : sp.panner(pan)");
B("sp-spat-blur", "Stereo Widener", "Spatial", [sig("l", "L"), sig("r", "R"), ctl("width", "width", 0.5, 0, 1)], "(l, r) : (\\(a,b).(a + (a-b)*width, b + (b-a)*width))");
B("sp-constant-power", "Balance", "Spatial", [sig("l", "L"), sig("r", "R"), ctl("bal", "balance", 0.5, 0, 1)], "l*sqrt(1-bal), r*sqrt(bal)");

// ------------------------------------------------------------------ Analysis (control outputs)
B("an-amp-follower", "Amp Follower", "Analysis", [sig("x", "in"), ctl("rel", "release", 0.1, 0.001, 2, "s")], "x : an.amp_follower(rel)");
B("an-amp-follower-ud", "Amp Follower UD", "Analysis", [sig("x", "in"), ctl("att", "attack", 0.01, 0.001, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s")], "x : an.amp_follower_ud(att, rel)");
B("an-rms", "RMS", "Analysis", [sig("x", "in"), ctl("tau", "tau", 0.05, 0.001, 1, "s")], "x : an.rms_envelope_tau(tau)");
B("an-zerocross", "Zero Crossing", "Analysis", [sig("x", "in"), ctl("period", "period", 0.05, 0.001, 1, "s")], "x : an.zcr(period)");

// ------------------------------------------------------------------ Math (2-in)
for (const [id, title, op] of [
  ["add", "Add", "a + b"], ["sub", "Subtract", "a - b"], ["mul", "Multiply", "a * b"], ["div", "Divide", "a / b"],
  ["min", "Min", "min(a, b)"], ["max", "Max", "max(a, b)"], ["mod", "Modulo", "fmod(a, b)"], ["pow", "Power", "pow(abs(a), b)"],
  ["atan2", "Atan2", "atan2(a, b)"],
]) {
  B(`math-${id}`, title, "Math", [sig("a", "a"), sig("b", "b")], op);
}
for (const [id, title, op] of [
  ["gt", "Greater >", "float(a > b)"], ["lt", "Less <", "float(a < b)"], ["ge", "≥", "float(a >= b)"],
  ["le", "≤", "float(a <= b)"], ["eq", "Equal =", "float(a == b)"],
]) {
  B(`logic-${id}`, title, "Math", [sig("a", "a"), sig("b", "b")], op);
}
// Math (1-in)
for (const [id, title, op] of [
  ["neg", "Negate", "-x"], ["abs", "Abs", "abs(x)"], ["inv", "Reciprocal", "1 / x"], ["sqrt", "Sqrt", "sqrt(abs(x))"],
  ["sin", "Sin", "sin(x)"], ["cos", "Cos", "cos(x)"], ["tan", "Tan", "tan(x)"], ["tanh", "Tanh", "ma.tanh(x)"],
  ["exp", "Exp", "exp(x)"], ["log", "Log", "log(abs(x) + 1e-9)"], ["floor", "Floor", "floor(x)"], ["ceil", "Ceil", "ceil(x)"],
  ["round", "Round", "rint(x)"], ["frac", "Fractional", "x - floor(x)"], ["rectify", "Rectify", "max(0, x)"],
  ["clip", "Clip ±1", "max(-1, min(1, x))"], ["square", "Square", "x * x"],
]) {
  B(`math1-${id}`, title, "Math", [sig("x", "in")], op);
}
// Math (control)
B("math-gain", "Gain", "Math", [sig("x", "in"), ctl("g", "gain", 1, 0, 4)], "x * g");
B("math-offset", "Offset", "Math", [sig("x", "in"), ctl("o", "offset", 0, -1, 1)], "x + o");
B("math-scale", "Scale + Offset", "Math", [sig("x", "in"), ctl("m", "mul", 1, -4, 4), ctl("a", "add", 0, -1, 1)], "x * m + a");
B("math-mix", "Crossfade", "Math", [sig("a", "a"), sig("b", "b"), ctl("mix", "mix", 0.5, 0, 1)], "a*(1-mix) + b*mix");

// ------------------------------------------------------------------ Conversions
for (const [id, title, fn] of [
  ["db2lin", "dB → Linear", "ba.db2linear(x)"], ["lin2db", "Linear → dB", "ba.linear2db(x)"],
  ["midi2hz", "MIDI → Hz", "ba.midikey2hz(x)"], ["hz2midi", "Hz → MIDI", "ba.hz2midikey(x)"],
  ["semi2ratio", "Semitone → Ratio", "ba.semi2ratio(x)"], ["ratio2semi", "Ratio → Semitone", "ba.ratio2semi(x)"],
  ["pole2tau", "Pole → Tau", "ba.pole2tau(x)"], ["tau2pole", "Tau → Pole", "ba.tau2pole(x)"],
]) {
  B(`conv-${id}`, title, "Convert", [sig("x", "in")], fn);
}

// ------------------------------------------------------------------ Routing / logic
B("route-split", "Mono → Stereo", "Routing", [sig("x", "in")], "x, x");
B("route-merge", "Stereo → Mono", "Routing", [sig("a", "L"), sig("b", "R")], "a + b");
B("route-swap", "Swap L/R", "Routing", [sig("a", "L"), sig("b", "R")], "b, a");
B("route-select2", "Select 2", "Routing", [sig("sel", "sel"), sig("a", "a"), sig("b", "b")], "select2(int(sel), a, b)");
B("route-select3", "Select 3", "Routing", [sig("sel", "sel"), sig("a", "a"), sig("b", "b"), sig("c", "c")], "select3(int(sel), a, b, c)");
B("route-mix3", "Mix 3", "Routing", [sig("a", "a"), sig("b", "b"), sig("c", "c")], "a + b + c");
B("route-mix4", "Mix 4", "Routing", [sig("a", "a"), sig("b", "b"), sig("c", "c"), sig("d", "d")], "a + b + c + d");
B("route-sah", "Sample & Hold", "Routing", [sig("x", "in"), sig("trig", "trig")], "(x, trig) : \\(s, t).(ba.sAndH(t, s))");
B("util-gate", "Gate (>0.5)", "Routing", [sig("x", "in"), sig("ctl", "ctl")], "x * (ctl > 0.5)");
B("util-recip-gate", "VCA", "Routing", [sig("x", "in"), sig("cv", "cv")], "x * cv");

// ================================================================= BATCH 2
// ------------------------------------------------------------------ CZ / more oscillators
for (const [fn, title] of [
  ["CZsaw", "CZ Saw"], ["CZsawP", "CZ Saw P"], ["CZsquare", "CZ Square"], ["CZsquareP", "CZ Square P"],
  ["CZpulse", "CZ Pulse"], ["CZpulseP", "CZ Pulse P"], ["CZsinePulse", "CZ Sine-Pulse"], ["CZsinePulseP", "CZ Sine-Pulse P"],
  ["CZresSaw", "CZ Res Saw"], ["CZresTriangle", "CZ Res Triangle"], ["CZresTrap", "CZ Res Trap"],
]) {
  B(`os-${fn.toLowerCase()}`, title, "Oscillators",
    [FREQ(), ctl("index", "index", 0.5, 0, 1), GAIN()], `os.${fn}(freq, index) * gain`);
}
for (const [fn, title] of [["oscb", "Sine (band-lim)"], ["oscrs", "Sine (recursive s)"], ["oscrc", "Sine (recursive c)"], ["oscs", "Sine (state var)"]]) {
  B(`os-${fn}`, title, "Oscillators", [FREQ(), GAIN()], `os.${fn}(freq) * gain`);
}
B("os-pulsetrainn", "Impulse (unit)", "Oscillators", [FREQ()], "os.imptrain(freq)");
B("os-quadosc", "Quadrature", "Oscillators", [FREQ(), GAIN()], "os.quadosc(freq) : _*gain, !");

// ------------------------------------------------------------------ More filters
for (const N of [3, 4]) {
  B(`fi-bandpass-${N}`, `Bandpass ${N}`, "Filters",
    [sig("x", "in"), ctl("fl", "low", 300, 20, 20000, "Hz"), ctl("fh", "high", 3000, 20, 20000, "Hz")],
    `x : fi.bandpass(${N}, fl, fh)`);
  B(`fi-bandstop-${N}`, `Bandstop ${N}`, "Filters",
    [sig("x", "in"), ctl("fl", "low", 300, 20, 20000, "Hz"), ctl("fh", "high", 3000, 20, 20000, "Hz")],
    `x : fi.bandstop(${N}, fl, fh)`);
}
B("fi-lowpass-lr4", "Lowpass LR4", "Filters", [sig("x", "in"), CUT()], "x : fi.lowpassLR4(cutoff)");
B("fi-highpass-lr4", "Highpass LR4", "Filters", [sig("x", "in"), CUT(300)], "x : fi.highpassLR4(cutoff)");
B("fi-ffcomb", "FF Comb", "Filters", [sig("x", "in"), ctl("ms", "delay", 10, 0.1, 100, "ms"), ctl("g", "gain", 0.5, -1, 1)], "x : fi.ffcombfilter(65536, ma.SR*ms/1000, g)");
B("fi-fbcomb", "FB Comb", "Filters", [sig("x", "in"), ctl("ms", "delay", 10, 0.1, 100, "ms"), ctl("g", "gain", 0.5, -0.99, 0.99)], "x : fi.fbcombfilter(65536, ma.SR*ms/1000, g)");
B("fi-allpass-comb", "Allpass Comb", "Filters", [sig("x", "in"), ctl("ms", "delay", 10, 0.1, 100, "ms"), ctl("g", "gain", 0.5, -0.99, 0.99)], "x : fi.allpass_comb(65536, ma.SR*ms/1000, g)");
B("fi-dcblockerat", "DC Blocker (freq)", "Filters", [sig("x", "in"), ctl("f", "freq", 35, 1, 500, "Hz")], "x : fi.dcblockerat(f)");
B("fi-nlf2", "Resonator (nlf2)", "Filters", [sig("x", "in"), CUT(), ctl("r", "r", 0.99, 0, 0.9999)], "x : fi.nlf2(cutoff, r) : _, !");
B("fi-highshelf2", "Bell", "Filters", [sig("x", "in"), ctl("g", "gain", 6, -24, 24, "dB"), CUT(), ctl("q", "q", 2, 0.1, 20)], "x : fi.peak_eq_cq(g, cutoff, q)");

// ------------------------------------------------------------------ Effects
B("ef-transpose", "Pitch Shift", "Effects", [sig("x", "in"), ctl("semi", "semitones", 0, -12, 12)], "x : ef.transpose(1024, 256, semi)");
B("ef-mixLinearClamp", "Dry/Wet Mix", "Effects", [sig("d", "dry"), sig("w", "wet"), ctl("mix", "mix", 0.5, 0, 1)], "(d, w) : ef.mixLinearClamp(2, 1, mix)");
B("ef-speakerbp", "Speaker Sim", "Effects", [sig("x", "in")], "x : ef.speakerbp(130, 5000)");
B("fx-autowah", "Auto Wah", "Effects", [sig("x", "in"), ctl("sens", "sens", 0.5, 0, 1)], "x : (\\(s).(s : fi.resonlp(200 + 4000*sens*(s : abs : an.amp_follower(0.02)), 8, 1.0)))");
B("fx-wah", "Wah (LFO)", "Effects", [sig("x", "in"), ctl("rate", "rate", 1.5, 0.05, 8, "Hz"), ctl("depth", "depth", 0.7, 0, 1)], "x : fi.resonlp(400 + 2500*depth*(0.5+0.5*os.osc(rate)), 8, 1.0)");
B("fx-phaser", "Phaser", "Effects", [sig("x", "in"), ctl("rate", "rate", 0.5, 0.01, 8, "Hz"), ctl("depth", "depth", 0.7, 0, 1)],
  "x : seq(i, 4, fi.allpassnn(1, 0.5 + 0.45*depth*(0.5+0.5*os.osc(rate))))");
B("fx-stereo-echo", "Stereo Echo", "Effects",
  [sig("l", "L"), sig("r", "R"), ctl("ms", "time", 300, 1, 2000, "ms"), ctl("fb", "feedback", 0.4, 0, 0.9)],
  "(l : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb)))), (r : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb))))");

// ------------------------------------------------------------------ Reverb (more)
B("re-dattorro", "Dattorro Plate", "Reverb", [sig("l", "L"), sig("r", "R")], "(l, r) : re.dattorro_rev_default");
B("re-zita", "Zita Rev1", "Reverb", [sig("l", "L"), sig("r", "R"), ctl("t60", "t60", 3, 0.5, 10, "s")],
  "(l, r) : re.zita_rev1_stereo(0, 200, 6000, t60, t60, 44100)");

// ------------------------------------------------------------------ Envelopes (exponential)
B("en-adsre", "ADSR (exp)", "Envelopes",
  [sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("d", "decay", 0.1, 0.001, 5, "s"), ctl("s", "sustain", 0.7, 0, 1), ctl("r", "release", 0.3, 0.001, 10, "s")],
  "en.adsre(a, d, s, r, gate)");
B("en-are", "AR (exp)", "Envelopes", [sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("r", "release", 0.3, 0.001, 10, "s")], "en.are(a, r, gate)");
B("en-asre", "ASR (exp)", "Envelopes", [sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("s", "sustain", 0.7, 0, 1), ctl("r", "release", 0.3, 0.001, 10, "s")], "en.asre(a, s, r, gate)");

// ------------------------------------------------------------------ Dynamics (more)
B("co-limiter-stereo", "Limiter (st)", "Dynamics", [sig("l", "L"), sig("r", "R")], "(l, r) : co.limiter_1176_R4_stereo");
B("co-expander", "Expander", "Dynamics",
  [sig("x", "in"), ctl("ratio", "ratio", 2, 1, 20), ctl("thresh", "thresh", -40, -90, 0, "dB"), ctl("att", "attack", 0.01, 0.001, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s")],
  "x * (min(0, (x : abs : an.amp_follower_ud(att, rel) : ba.linear2db : -(thresh)) * (ratio - 1)) : ba.db2linear)");

// ------------------------------------------------------------------ Analysis (more)
B("an-abs-tau", "Abs Envelope", "Analysis", [sig("x", "in"), ctl("tau", "tau", 0.05, 0.001, 1, "s")], "x : an.abs_envelope_tau(tau)");
B("an-ms-tau", "Mean-Square Env", "Analysis", [sig("x", "in"), ctl("tau", "tau", 0.05, 0.001, 1, "s")], "x : an.ms_envelope_tau(tau)");
B("an-amp-follower-ar", "Amp Follower AR", "Analysis", [sig("x", "in"), ctl("att", "attack", 0.01, 0.001, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s")], "x : an.amp_follower_ar(att, rel)");

// ------------------------------------------------------------------ Signals / smoothing
B("si-smoo", "Smooth (fixed)", "Signals", [sig("x", "in")], "x : si.smoo");
B("si-lag-ud", "Slew (up/down)", "Signals", [sig("x", "in"), ctl("up", "up", 0.05, 0, 1, "s"), ctl("dn", "down", 0.05, 0, 1, "s")], "x : si.lag_ud(up, dn)");
B("ba-peakhold", "Peak Hold", "Signals", [sig("x", "in"), ctl("t", "hold", 0.2, 0, 2, "s")], "x : ba.peakholder(ma.SR*t)");
B("ba-downsample", "Downsample", "Signals", [sig("x", "in"), ctl("f", "rate", 8000, 100, 48000, "Hz")], "x : ba.downSample(f)");
B("ba-latch", "Latch", "Signals", [sig("x", "in"), sig("clk", "clock")], "(x, clk) : \\(s, c).(ba.latch(c, s))");

// ------------------------------------------------------------------ Math (more unary)
for (const [id, title, op] of [
  ["asin", "Asin", "asin(max(-1, min(1, x)))"], ["acos", "Acos", "acos(max(-1, min(1, x)))"], ["atan", "Atan", "atan(x)"],
  ["sinh", "Sinh", "ma.sinh(x)"], ["cosh", "Cosh", "ma.cosh(x)"], ["log10", "Log10", "log10(abs(x) + 1e-9)"],
  ["signum", "Sign", "ma.signum(x)"], ["trunc", "Truncate", "float(int(x))"], ["fract2", "Wrap 0..1", "ma.frac(x)"],
  ["clip01", "Clip 0..1", "max(0, min(1, x))"], ["bipolar2unipolar", "±1 → 0..1", "x*0.5 + 0.5"], ["unipolar2bipolar", "0..1 → ±1", "x*2 - 1"],
]) {
  B(`math1-${id}`, title, "Math", [sig("x", "in")], op);
}
// Logic gates (bipolar gate signals)
for (const [id, title, op] of [
  ["and", "AND", "float((a > 0.5) & (b > 0.5))"], ["or", "OR", "float((a > 0.5) | (b > 0.5))"],
  ["xor", "XOR", "float((a > 0.5) ^ (b > 0.5))"], ["nand", "NAND", "float(1 - ((a > 0.5) & (b > 0.5)))"],
]) {
  B(`logic-${id}`, title, "Math", [sig("a", "a"), sig("b", "b")], op);
}
B("logic-not", "NOT", "Math", [sig("x", "in")], "float(x <= 0.5)");
B("math-smoothstep", "Smoothstep", "Math", [sig("x", "in")], "(max(0,min(1,x)) : \\(t).(t*t*(3 - 2*t)))");
B("math-quantize", "Quantize", "Math", [sig("x", "in"), ctl("steps", "steps", 8, 2, 64)], "rint(x * steps) / steps");
B("math-deadzone", "Dead Zone", "Math", [sig("x", "in"), ctl("t", "thresh", 0.1, 0, 1)], "(abs(x) > t) * x");
B("math-clip-to", "Clip Range", "Math", [sig("x", "in"), ctl("lo", "lo", -1, -10, 10), ctl("hi", "hi", 1, -10, 10)], "max(lo, min(hi, x))");
B("math-gain-db", "Gain (dB)", "Math", [sig("x", "in"), ctl("db", "gain", 0, -60, 12, "dB")], "x * ba.db2linear(db)");

// ------------------------------------------------------------------ Routing (more)
for (const n of [5, 6, 8]) {
  const names = Array.from({ length: n }, (_, i) => `a${i}`);
  B(`route-mix${n}`, `Mix ${n}`, "Routing", names.map((nm, i) => sig(nm, `in ${i + 1}`)), names.join(" + "));
}
B("route-dup4", "Mono → Quad", "Routing", [sig("x", "in")], "x, x, x, x");
B("route-mid-side", "L/R → Mid/Side", "Routing", [sig("l", "L"), sig("r", "R")], "(l + r)*0.5, (l - r)*0.5");
B("route-side-mid", "Mid/Side → L/R", "Routing", [sig("m", "M"), sig("s", "S")], "m + s, m - s");

// ------------------------------------------------------------------ Synths (physical/synth models)
B("sy-dubdub", "DubDub Synth", "Synths", [sig("gate", "gate"), FREQ(), ctl("ct", "cutoff", 500, 50, 8000, "Hz"), ctl("q", "q", 6, 0.5, 20)], "sy.dubDub(freq, ct, q, gate)");
B("sy-sawtrombone", "Saw Trombone", "Synths", [sig("gate", "gate"), FREQ(), GAIN(0.8)], "sy.sawTrombone(freq, gain, gate)");
B("sy-combstring", "Comb String", "Synths", [sig("gate", "gate"), FREQ(), ctl("res", "res", 0.9, 0, 1)], "sy.combString(freq, res, gate)");
B("pm-ks", "Karplus-Strong", "Synths", [sig("trig", "trig"), FREQ(), ctl("t60", "decay", 4, 0.1, 20, "s")], "pm.ks(freq, t60, trig)");

// ================================================================= BATCH 3
// ------------------------------------------------------------------ Higher-order filters
for (const N of [5, 6, 7, 8]) {
  B(`fi-lowpass-${N}`, `Lowpass ${N}p`, "Filters", [sig("x", "in"), CUT()], `x : fi.lowpass(${N}, cutoff)`);
  B(`fi-highpass-${N}`, `Highpass ${N}p`, "Filters", [sig("x", "in"), CUT(300)], `x : fi.highpass(${N}, cutoff)`);
}
for (const [fn, title] of [["lp", "SVF Lowpass"], ["hp", "SVF Highpass"], ["bp", "SVF Bandpass"], ["notch", "SVF Notch"], ["peak", "SVF Peak"], ["ap", "SVF Allpass"]]) {
  B(`fi-svf-${fn}`, title, "Filters", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 30)], `x : fi.svf.${fn}(cutoff, q)`);
}

// ------------------------------------------------------------------ Synth oscillators
B("osc-fm2", "FM 2-op", "Oscillators", [FREQ(), ctl("ratio", "ratio", 2, 0.1, 12), ctl("index", "index", 2, 0, 20), GAIN()], "os.osc(freq + index*freq*os.osc(freq*ratio)) * gain");
B("osc-supersaw", "Supersaw", "Oscillators", [FREQ(), ctl("detune", "detune", 1, 0, 5), GAIN(0.3)], "(os.sawtooth(freq) + os.sawtooth(freq*(1+detune*0.01)) + os.sawtooth(freq*(1-detune*0.01)))/3 * gain");
B("osc-pwm", "PWM Square", "Oscillators", [FREQ(), ctl("width", "width", 0.5, 0.05, 0.95), GAIN(0.4)], "(os.lf_sawpos(freq) < width) * 2 - 1 : *(gain)");
B("osc-organ", "Additive Organ", "Oscillators", [FREQ(), GAIN(0.3)], "(os.osc(freq) + 0.5*os.osc(freq*2) + 0.3*os.osc(freq*3) + 0.2*os.osc(freq*4)) * gain");
B("osc-detune2", "Detuned Pair", "Oscillators", [FREQ(), ctl("detune", "detune", 3, 0, 30, "cents"), GAIN(0.4)], "(os.sawtooth(freq) + os.sawtooth(freq*pow(2, detune/1200)))*0.5 * gain");

// ------------------------------------------------------------------ Waveshapers (Chebyshev + shapes)
for (const [id, title, poly] of [
  ["cheb2", "Chebyshev 2", "2*x*x - 1"],
  ["cheb3", "Chebyshev 3", "4*x*x*x - 3*x"],
  ["cheb4", "Chebyshev 4", "8*x*x*x*x - 8*x*x + 1"],
  ["cheb5", "Chebyshev 5", "16*pow(x,5) - 20*x*x*x + 5*x"],
]) {
  B(`ws-${id}`, title, "Distortion", [sig("x", "in")], `(max(-1,min(1,x)) : \\(x).(${poly}))`);
}
B("ws-softsign", "Softsign", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 20)], "(x*drive) / (1 + abs(x*drive))");
B("ws-sigmoid", "Sigmoid", "Distortion", [sig("x", "in"), ctl("drive", "drive", 3, 1, 20)], "2/(1 + exp(-x*drive)) - 1");
B("ws-diode", "Diode", "Distortion", [sig("x", "in"), ctl("drive", "drive", 2, 1, 20)], "ma.tanh(max(0, x*drive)) - ma.tanh(max(0, -x*drive))*0.7");
B("ws-foldback", "Foldback", "Distortion", [sig("x", "in"), ctl("drive", "drive", 3, 1, 20)], "(\\(y).(y - 2*rint(y*0.5)*1))(x*drive) : max(-1) : min(1)");
B("ws-overdrive", "Overdrive", "Distortion", [sig("x", "in"), ctl("drive", "drive", 4, 1, 30)], "ma.tanh(x*drive) * (1/ma.tanh(drive))");

// ------------------------------------------------------------------ Modulation (more)
B("mod-chorus", "Chorus", "Modulation", [sig("x", "in"), ctl("rate", "rate", 0.6, 0.05, 6, "Hz"), ctl("depth", "depth", 0.5, 0, 1)],
  "0.5*x + 0.5*(x : de.fdelay(4096, ma.SR*(0.012 + 0.006*depth*(0.5+0.5*os.osc(rate)))))");
B("mod-autopan", "Auto Pan", "Modulation", [sig("x", "in"), ctl("rate", "rate", 1, 0.05, 8, "Hz")], "x : sp.panner(0.5 + 0.5*os.osc(rate))");
B("mod-ensemble", "Ensemble", "Modulation", [sig("x", "in"), ctl("depth", "depth", 0.5, 0, 1)],
  "(x : de.fdelay(4096, ma.SR*(0.01 + 0.004*depth*(0.5+0.5*os.osc(0.3))))) + (x : de.fdelay(4096, ma.SR*(0.011 + 0.004*depth*(0.5+0.5*os.osc(0.47))))) : *(0.5)");
B("mod-rotary", "Rotary Speaker", "Modulation", [sig("x", "in"), ctl("rate", "rate", 6, 0.5, 12, "Hz")], "x * (0.7 + 0.3*os.osc(rate)) : de.fdelay(4096, ma.SR*(0.002 + 0.001*os.osc(rate)))");

// ------------------------------------------------------------------ Delay (multi-tap)
B("de-multitap2", "Multitap x2", "Delay", [sig("x", "in"), ctl("ms", "time", 200, 1, 1000, "ms"), ctl("fb", "feedback", 0.3, 0, 0.9)],
  "x : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb))) : \\(y).(y + (y : de.fdelay(192000, ma.SR*ms*0.5/1000))*0.5)");
B("de-slapback", "Slapback", "Delay", [sig("x", "in"), ctl("ms", "time", 90, 10, 250, "ms"), ctl("mix", "mix", 0.4, 0, 1)],
  "x*(1-mix) + (x : de.fdelay(192000, ma.SR*ms/1000))*mix");

// ------------------------------------------------------------------ Math / utility (more)
for (const [id, title, op] of [
  ["hypot", "Hypotenuse", "sqrt(a*a + b*b)"], ["avg", "Average", "(a + b)*0.5"], ["absdiff", "Abs Diff", "abs(a - b)"], ["copysign", "Copy Sign", "ma.signum(b)*abs(a)"],
]) {
  B(`math-${id}`, title, "Math", [sig("a", "a"), sig("b", "b")], op);
}
for (const [id, title, op] of [
  ["exp2", "Exp2", "pow(2, x)"], ["log2", "Log2", "log(abs(x)+1e-9)/log(2)"], ["gauss", "Gaussian", "exp(-x*x)"],
  ["cube", "Cube", "x*x*x"], ["recip1", "1/(1+x)", "1/(1 + abs(x))"], ["expo", "Expo Curve", "(exp(max(0,min(1,x))) - 1)/(exp(1) - 1)"],
]) {
  B(`math1-${id}`, title, "Math", [sig("x", "in")], op);
}

// ------------------------------------------------------------------ Routing / spatial (more)
B("route-cross3", "Crossfade 3", "Routing", [sig("a", "a"), sig("b", "b"), sig("c", "c"), sig("x", "pos")], "(x < 1) * ((1-x)*a + x*b) + (x >= 1) * ((2-x)*b + (x-1)*c)");
B("route-rotate-st", "Rotate Stereo", "Spatial", [sig("l", "L"), sig("r", "R"), ctl("amt", "angle", 0, -1, 1)], "l*cos(amt*ma.PI*0.5) - r*sin(amt*ma.PI*0.5), l*sin(amt*ma.PI*0.5) + r*cos(amt*ma.PI*0.5)");
B("sp-haas", "Haas Widener", "Spatial", [sig("x", "in"), ctl("ms", "delay", 15, 0, 40, "ms")], "x, (x : de.fdelay(4096, ma.SR*ms/1000))");
B("sp-autopan2", "Tremolo Pan", "Spatial", [sig("x", "in"), ctl("rate", "rate", 2, 0.05, 8, "Hz")], "x*(0.5+0.5*os.osc(rate)), x*(0.5-0.5*os.osc(rate))");

// ------------------------------------------------------------------ ba utilities
B("ba-impulsify", "Impulsify", "Signals", [sig("x", "in")], "x : ba.impulsify");
B("ba-sample-hold2", "Track & Hold", "Signals", [sig("x", "in"), sig("hold", "hold")], "(x, hold) : \\(s, h).(ba.sAndH(h <= 0.5, s))");
B("dyn-transient", "Transient Shaper", "Dynamics", [sig("x", "in"), ctl("amt", "attack", 0.5, 0, 2)],
  "x * (1 + amt*((x : an.amp_follower(0.003)) - (x : an.amp_follower(0.05))))");

// ================================================================= BATCH 4
// Fixed-frequency EQ bands used to live here — 30 copies of fi.peak_eq with the centre
// frozen. They are covered by the parametric Peak EQ / Bell blocks (frequency as a port,
// so it can be swept) and by the Graphic EQ widget, which is one node for the whole
// curve. Don't reintroduce a block whose only variable is a value that could be an input.
// Formant / vowel filters
for (const [id, name, f1, f2, f3] of [
  ["a", "A", 700, 1220, 2600], ["e", "E", 400, 1700, 2600], ["i", "I", 240, 2400, 2900], ["o", "O", 360, 750, 2400], ["u", "U", 250, 595, 2400],
]) {
  B(`fi-vowel-${id}`, `Vowel ${name}`, "Filters", [sig("x", "in"), GAIN(1)],
    `(x : fi.resonbp(${f1}, 12, 1) + x : fi.resonbp(${f2}, 10, 0.6) + x : fi.resonbp(${f3}, 10, 0.3)) * gain`);
}
// Bandpass/bandstop higher orders
for (const N of [5, 6, 8]) {
  B(`fi-bandpass-${N}`, `Bandpass ${N}`, "Filters", [sig("x", "in"), ctl("fl", "low", 300, 20, 20000, "Hz"), ctl("fh", "high", 3000, 20, 20000, "Hz")], `x : fi.bandpass(${N}, fl, fh)`);
}
B("fi-allpass2", "Allpass x2", "Filters", [sig("x", "in"), ctl("g", "coeff", 0.5, -0.99, 0.99)], "x : seq(i, 2, fi.allpassnn(1, g))");
B("fi-allpass4", "Allpass x4", "Filters", [sig("x", "in"), ctl("g", "coeff", 0.5, -0.99, 0.99)], "x : seq(i, 4, fi.allpassnn(1, g))");

// ------------------------------------------------------------------ Oscillators
B("osc-fm3", "FM 3-op", "Oscillators", [FREQ(), ctl("r2", "ratio2", 2, 0.1, 12), ctl("i2", "index2", 2, 0, 20), ctl("r3", "ratio3", 3, 0.1, 12), ctl("i3", "index3", 1, 0, 20), GAIN()],
  "os.osc(freq + i2*freq*os.osc(freq*r2) + i3*freq*os.osc(freq*r3)) * gain");
B("osc-add-saw", "Additive Saw", "Oscillators", [FREQ(), GAIN()], "(sum(k, 10, os.osc(freq*(k+1)) / (k+1))) * gain");
B("osc-add-square", "Additive Square", "Oscillators", [FREQ(), GAIN()], "(sum(k, 8, os.osc(freq*(2*k+1)) / (2*k+1))) * gain");
B("osc-supersaw7", "Supersaw x7", "Oscillators", [FREQ(), ctl("detune", "detune", 2, 0, 10, "cents"), GAIN(0.2)],
  "(sum(k, 7, os.sawtooth(freq*pow(2, (k-3)*detune/1200)))) / 7 * gain");
B("osc-morph", "Wave Morph", "Oscillators", [FREQ(), ctl("morph", "morph", 0, 0, 1), GAIN(0.4)],
  "((1-morph)*os.osc(freq) + morph*os.sawtooth(freq)) * gain");
B("osc-sub", "Osc + Sub", "Oscillators", [FREQ(), ctl("sub", "sub", 0.5, 0, 1), GAIN(0.4)], "(os.sawtooth(freq) + sub*os.square(freq*0.5)) * gain");

// ------------------------------------------------------------------ Waveshapers
for (const [id, title, body] of [
  ["cheb6", "Chebyshev 6", "32*x*x*x*x*x*x - 48*x*x*x*x + 18*x*x - 1"],
  ["cheb7", "Chebyshev 7", "64*x*x*x*x*x*x*x - 112*x*x*x*x*x + 56*x*x*x - 7*x"],
  ["cheb8", "Chebyshev 8", "128*pow(x,8) - 256*pow(x,6) + 160*x*x*x*x - 32*x*x + 1"],
]) {
  B(`ws-${id}`, title, "Distortion", [sig("x", "in")], `(max(-1,min(1,x)) : \\(x).(${body}))`);
}
B("ws-asym-tanh", "Asym Tanh", "Distortion", [sig("x", "in"), ctl("drive", "drive", 3, 1, 20), ctl("bias", "bias", 0.2, -1, 1)], "ma.tanh(x*drive + bias) - ma.tanh(bias)");
B("ws-tube", "Tube", "Distortion", [sig("x", "in"), ctl("drive", "drive", 3, 1, 20)], "(\\(y).(y - 0.15*y*y - 0.1*y*y*y))(ma.tanh(x*drive))");
B("ws-fuzz", "Fuzz (exp)", "Distortion", [sig("x", "in"), ctl("drive", "drive", 20, 1, 100)], "ma.signum(x) * (1 - exp(0 - abs(x*drive)))");
B("ws-rect-shape", "Rectifier Shape", "Distortion", [sig("x", "in"), ctl("mix", "mix", 0.5, 0, 1)], "x*(1-mix) + abs(x)*mix");
B("ws-sine-stage", "Sine Shaper", "Distortion", [sig("x", "in"), ctl("drive", "drive", 1, 0.1, 4)], "sin(x*drive*ma.PI*0.5)");
B("ws-crossover", "Crossover Dist", "Distortion", [sig("x", "in"), ctl("dead", "deadzone", 0.1, 0, 0.5)], "(abs(x) > dead) * (x - ma.signum(x)*dead)");
B("ws-exp-shape", "Exp Shaper", "Distortion", [sig("x", "in"), ctl("amt", "amount", 2, 0.1, 10)], "ma.signum(x) * (1 - exp(0 - abs(x)*amt))");
B("ws-halfrect-sat", "Half-wave Sat", "Distortion", [sig("x", "in"), ctl("drive", "drive", 4, 1, 20)], "ma.tanh(max(0, x)*drive) - 0.5*ma.tanh(max(0, -x)*drive)");

// ------------------------------------------------------------------ Modulation
for (const stages of [2, 6, 8]) {
  B(`mod-phaser${stages}`, `Phaser ${stages}-stage`, "Modulation", [sig("x", "in"), ctl("rate", "rate", 0.5, 0.01, 8, "Hz"), ctl("depth", "depth", 0.7, 0, 1)],
    `x : seq(i, ${stages}, fi.allpassnn(1, 0.5 + 0.45*depth*(0.5+0.5*os.osc(rate))))`);
}
B("mod-tremolo-saw", "Tremolo (saw)", "Modulation", [sig("x", "in"), ctl("rate", "rate", 5, 0.1, 20, "Hz"), ctl("depth", "depth", 0.5, 0, 1)], "x * (1 - depth*os.lf_sawpos(rate))");
B("mod-tremolo-sq", "Tremolo (square)", "Modulation", [sig("x", "in"), ctl("rate", "rate", 5, 0.1, 20, "Hz"), ctl("depth", "depth", 0.5, 0, 1)], "x * (1 - depth*(os.lf_squarewave(rate)*0.5+0.5))");
B("mod-chorus3", "Chorus x3", "Modulation", [sig("x", "in"), ctl("depth", "depth", 0.5, 0, 1)],
  "0.5*x + 0.5*(sum(k, 3, x : de.fdelay(4096, ma.SR*(0.01 + 0.005*depth*(0.5+0.5*os.osc(0.3 + k*0.13))))))/3");
B("mod-ringmod-st", "Ring Mod (stereo)", "Modulation", [sig("x", "in"), ctl("freq", "freq", 200, 1, 5000, "Hz")], "x*os.osc(freq), x*os.osc(freq*1.005)");

// ------------------------------------------------------------------ Math / logic
for (const [id, title, op] of [
  ["and-int", "Bit AND", "float(int(a) & int(b))"], ["or-int", "Bit OR", "float(int(a) | int(b))"], ["xor-int", "Bit XOR", "float(int(a) xor int(b))"],
  ["shl", "Shift Left", "float(int(a) << int(b))"], ["shr", "Shift Right", "float(int(a) >> int(b))"],
  ["step", "Step", "float(a >= b)"], ["wrap", "Wrap", "a - b*floor(a/b)"], ["min3-x", "Min", "min(a, b)"],
]) {
  B(`logic-${id}`, title, "Math", [sig("a", "a"), sig("b", "b")], op);
}
B("math-min3", "Min 3", "Math", [sig("a", "a"), sig("b", "b"), sig("c", "c")], "min(a, min(b, c))");
B("math-max3", "Max 3", "Math", [sig("a", "a"), sig("b", "b"), sig("c", "c")], "max(a, max(b, c))");
B("math-clamp-sym", "Clamp ±", "Math", [sig("x", "in"), ctl("lim", "limit", 1, 0, 10)], "max(-lim, min(lim, x))");
B("math-attenuvert", "Attenuverter", "Math", [sig("x", "in"), ctl("amt", "amount", 1, -2, 2)], "x * amt");
for (const [id, title, op] of [
  ["rsqrt", "Rsqrt", "1/sqrt(abs(x)+1e-9)"], ["sec", "Secant", "1/cos(x)"], ["csc", "Cosecant", "1/sin(x)"], ["cot", "Cotangent", "cos(x)/sin(x)"],
]) {
  B(`math1-${id}`, title, "Math", [sig("x", "in")], op);
}
for (const [id, title, op] of [["nor", "NOR", "float(1 - ((a > 0.5) | (b > 0.5)))"], ["xnor", "XNOR", "float(1 - ((a > 0.5) ^ (b > 0.5)))"]]) {
  B(`logic-${id}`, title, "Math", [sig("a", "a"), sig("b", "b")], op);
}

// ------------------------------------------------------------------ Conversions
for (const [id, title, op] of [
  ["cents2ratio", "Cents → Ratio", "pow(2, x/1200)"], ["ratio2cents", "Ratio → Cents", "1200*log(max(1e-9,x))/log(2)"],
  ["bpm2hz", "BPM → Hz", "x/60"], ["hz2bpm", "Hz → BPM", "x*60"],
]) {
  B(`conv-${id}`, title, "Convert", [sig("x", "in")], op);
}

// ------------------------------------------------------------------ Routing / utility
B("util-attenuvert", "Attenuvert (CV)", "Routing", [sig("x", "in"), sig("cv", "amount")], "x * cv");
B("util-xfade-eq", "Crossfade (eq-pwr)", "Routing", [sig("a", "a"), sig("b", "b"), ctl("mix", "mix", 0.5, 0, 1)], "a*cos(mix*ma.PI*0.5) + b*sin(mix*ma.PI*0.5)");
B("util-sum-gain", "Sum + Gain", "Routing", [sig("a", "a"), sig("b", "b"), ctl("g", "gain", 0.5, 0, 1)], "(a + b) * g");
B("util-gate2trig", "Gate → Trigger", "Routing", [sig("g", "gate")], "g : ba.impulsify");
B("util-invert", "Invert", "Routing", [sig("x", "in")], "-x");
B("util-dup3", "Mono → 3", "Routing", [sig("x", "in")], "x, x, x");
B("util-dcblock", "DC Block", "Routing", [sig("x", "in")], "x : fi.dcblocker");

// ------------------------------------------------------------------ Envelopes
B("en-perc", "Perc (AD)", "Envelopes", [sig("gate", "gate"), ctl("a", "attack", 0.005, 0.001, 2, "s"), ctl("d", "decay", 0.3, 0.001, 5, "s")], "en.ar(a, d, gate)");
B("en-trap", "Trapezoid", "Envelopes", [sig("gate", "gate"), ctl("a", "attack", 0.05, 0.001, 2, "s"), ctl("r", "release", 0.2, 0.001, 5, "s")], "en.asr(a, 1, r, gate)");

// ------------------------------------------------------------------ Dynamics (sidechain / 2-in)
B("dyn-sidechain", "Sidechain Comp", "Dynamics", [sig("x", "in"), sig("sc", "sidechain"), ctl("ratio", "ratio", 4, 1, 20), ctl("thresh", "thresh", -20, -60, 0, "dB")],
  "x * ((sc : an.amp_follower(0.05) : ba.linear2db) : \\(l).(min(0, (thresh - l)*(1 - 1/ratio)) : ba.db2linear))");
B("dyn-ducker", "Ducker", "Dynamics", [sig("x", "in"), sig("sc", "sidechain"), ctl("amt", "amount", 0.8, 0, 1)], "x * (1 - amt*(sc : abs : an.amp_follower(0.02) : min(1)))");

// ------------------------------------------------------------------ Spatial
B("sp-ms-balance", "M/S Balance", "Spatial", [sig("l", "L"), sig("r", "R"), ctl("ms", "mid/side", 0.5, 0, 1)], "((l+r)*0.5*(1-ms) + (l-r)*0.5*ms), ((l+r)*0.5*(1-ms) - (l-r)*0.5*ms)");
B("sp-pan3", "Pan (3-way)", "Spatial", [sig("x", "in"), ctl("pan", "pan", 0.5, 0, 1)], "x*max(0,1-2*pan), x*(1 - abs(2*pan-1)), x*max(0,2*pan-1)");

// ------------------------------------------------------------------ Synths / physical models
B("pm-djembe", "Djembe", "Synths", [sig("trig", "trig"), FREQ(), ctl("pos", "strike pos", 0.3, 0, 1), ctl("sharp", "sharpness", 0.5, 0, 1), GAIN(0.8)], "pm.djembe(freq, pos, sharp, gain, trig)");
B("pm-marimba", "Marimba", "Synths", [sig("trig", "trig"), FREQ(), ctl("pos", "strike pos", 0.3, 0, 1), GAIN(0.8)], "(trig : pm.marimbaModel(freq, pos)) * gain");
B("sy-popperc", "Filter Perc", "Synths", [sig("gate", "gate"), FREQ(), ctl("q", "q", 12, 1, 40)], "no.noise * (gate : en.ar(0.001, 0.12)) : fi.resonlp(freq, q, 1)");
B("sy-additive-drum", "Additive Drum", "Synths", [sig("gate", "gate"), FREQ(), ctl("ratio", "ratio", 1.5, 0.5, 5), GAIN(0.7)], "sy.additiveDrum(freq, (1, ratio, ratio*2), (1, 0.6, 0.3), 0.8, 0.001, 0.3, gate) * gain");

// ================================================================= BATCH 5
// ------------------------------------------------------------------ Filters (fixes + more)
// The official 2-band split (4th-order Linkwitz-Riley, flat amplitude at the crossover).
// Was hand-wired as lowpassLR4/highpassLR4, which is bit-identical — this just calls the
// library entry point so the block tracks upstream.
B("fi-crossover2", "Crossover 2-band", "Filters", [sig("x", "in"), CUT()], "x : fi.crossover2LR4(cutoff)");
B("fi-crossover3", "Crossover 3-band", "Filters", [sig("x", "in"), ctl("f1", "low", 300, 20, 5000, "Hz"), ctl("f2", "high", 3000, 100, 20000, "Hz")],
  "x <: fi.lowpassLR4(f1), (fi.highpassLR4(f1) : fi.lowpassLR4(f2)), fi.highpassLR4(f2)");
B("fi-allpass8", "Allpass x8", "Filters", [sig("x", "in"), ctl("g", "coeff", 0.5, -0.99, 0.99)], "x : seq(i, 8, fi.allpassnn(1, g))");
B("fi-resonbank", "Resonator Bank", "Filters", [sig("x", "in"), CUT(), ctl("q", "q", 12, 1, 40)], "(x : fi.resonbp(cutoff, q, 1) + x : fi.resonbp(cutoff*2, q, 0.6) + x : fi.resonbp(cutoff*3, q, 0.4))");
B("fi-formant-shift", "Formant Shift", "Filters", [sig("x", "in"), ctl("shift", "shift", 1, 0.5, 2)], "(x : fi.resonbp(700*shift, 12, 1) + x : fi.resonbp(1220*shift, 10, 0.6))");

// ------------------------------------------------------------------ Oscillators
B("osc-add-triangle", "Additive Triangle", "Oscillators", [FREQ(), GAIN()], "(sum(k, 6, (1 - 2*(k%2)) * os.osc(freq*(2*k+1)) / ((2*k+1)*(2*k+1)))) * gain");
B("osc-drawbar", "Drawbar Organ", "Oscillators", [FREQ(), GAIN(0.3)], "(os.osc(freq*0.5) + os.osc(freq) + os.osc(freq*1.5) + os.osc(freq*2) + os.osc(freq*3) + os.osc(freq*4))/6 * gain");
B("osc-supersaw5", "Supersaw x5", "Oscillators", [FREQ(), ctl("detune", "detune", 3, 0, 15, "cents"), GAIN(0.25)], "(sum(k, 5, os.sawtooth(freq*pow(2, (k-2)*detune/1200))))/5 * gain");
B("osc-2op-stack", "FM Stack", "Oscillators", [FREQ(), ctl("index", "index", 3, 0, 20), GAIN()], "os.osc(freq + index*freq*os.osc(freq*2 + freq*os.osc(freq*3))) * gain");

// ------------------------------------------------------------------ Waveshapers (working set)
B("ws-fuzz2", "Fuzz", "Distortion", [sig("x", "in"), ctl("drive", "drive", 30, 1, 100)], "ma.tanh(x*drive) : max(-0.9) : min(0.9)");
B("ws-octave-up", "Octave Up", "Distortion", [sig("x", "in")], "2*abs(x) - 1");
B("ws-asym-clip", "Asym Clip", "Distortion", [sig("x", "in"), ctl("drive", "drive", 3, 1, 20)], "max(-0.5, min(1, x*drive))");
B("ws-poly-soft", "Poly Soft Clip", "Distortion", [sig("x", "in"), ctl("drive", "drive", 3, 1, 20)], "(\\(y).(1.5*y - 0.5*y*y*y))(max(-1, min(1, x*drive)))");
B("ws-exp-sat", "Exp Saturate", "Distortion", [sig("x", "in"), ctl("amt", "amount", 3, 0.5, 20)], "ma.signum(x) * (1 - 1/(1 + amt*abs(x)))");
B("ws-rectifier", "Full Rectifier", "Distortion", [sig("x", "in")], "abs(x)");
B("ws-halfrect", "Half Rectifier", "Distortion", [sig("x", "in")], "max(0, x)");

// ------------------------------------------------------------------ Modulation
B("mod-flanger2", "Flanger", "Modulation", [sig("x", "in"), ctl("rate", "rate", 0.4, 0.01, 8, "Hz"), ctl("depth", "depth", 0.6, 0, 1)],
  "0.5*x + 0.5*(x : de.fdelay(4096, ma.SR*0.001*(1 + 4*depth*(0.5+0.5*os.osc(rate)))))");
B("mod-univibe", "Uni-Vibe", "Modulation", [sig("x", "in"), ctl("rate", "rate", 2, 0.1, 8, "Hz")],
  "x : seq(i, 4, fi.allpassnn(1, 0.6 + 0.35*(0.5+0.5*os.osc(rate + i*0.05))))");
B("mod-stereo-chorus", "Stereo Chorus", "Modulation", [sig("x", "in"), ctl("rate", "rate", 0.6, 0.05, 6, "Hz"), ctl("depth", "depth", 0.5, 0, 1)],
  "0.5*x + 0.5*(x : de.fdelay(4096, ma.SR*(0.012 + 0.006*depth*(0.5+0.5*os.osc(rate))))), 0.5*x + 0.5*(x : de.fdelay(4096, ma.SR*(0.012 + 0.006*depth*(0.5+0.5*os.osc(rate + 0.25)))))");
B("mod-autowah-env", "Env Wah", "Modulation", [sig("x", "in"), ctl("sens", "sens", 0.5, 0, 1), ctl("q", "q", 6, 1, 20)], "x : fi.resonlp(300 + 3000*sens*(x : abs : an.amp_follower(0.02)), q, 1)");

// ------------------------------------------------------------------ Math
for (const [id, title, op] of [
  ["ssqrt", "Signed Sqrt", "ma.signum(x)*sqrt(abs(x))"], ["ssquare", "Signed Square", "ma.signum(x)*x*x"],
  ["softabs", "Soft Abs", "sqrt(x*x + 0.01)"], ["smootherstep", "Smootherstep", "(max(0,min(1,x)) : \\(t).(t*t*t*(t*(t*6 - 15) + 10)))"],
  ["dcblock1", "Leaky Integrator", "x : fi.pole(0.999)"], ["absmax1", "Peak Track", "abs(x)"],
]) {
  B(`math1-${id}`, title, "Math", [sig("x", "in")], op);
}
B("math-comparator", "Comparator", "Math", [sig("x", "in"), ctl("thresh", "thresh", 0, -1, 1)], "float(x > thresh)");
B("math-pulsewidth", "Pulse Width", "Math", [sig("x", "in"), ctl("w", "width", 0.5, 0, 1)], "float(x < w)*2 - 1");
B("math-weighted-sum", "Weighted Sum", "Math", [sig("a", "a"), sig("b", "b"), ctl("wa", "weight a", 0.5, 0, 1), ctl("wb", "weight b", 0.5, 0, 1)], "a*wa + b*wb");

// ------------------------------------------------------------------ Utility
B("util-phase-invert-r", "Invert R", "Routing", [sig("l", "L"), sig("r", "R")], "l, -r");
B("util-stereo-sum", "Stereo Sum", "Routing", [sig("l", "L"), sig("r", "R"), ctl("g", "gain", 0.5, 0, 1)], "(l + r) * g");
B("util-gain2", "Gain (2-in)", "Routing", [sig("a", "a"), sig("b", "b"), ctl("g", "gain", 1, 0, 2)], "a*g, b*g");
B("util-mute", "Mute Gate", "Routing", [sig("x", "in"), ctl("on", "on", 1, 0, 1)], "x * (on > 0.5)");

// ------------------------------------------------------------------ Reverb
B("re-schroeder", "Schroeder", "Reverb", [sig("x", "in"), ctl("decay", "decay", 0.7, 0, 0.95)],
  "x <: (fi.fbcombfilter(8192, 1687, decay) + fi.fbcombfilter(8192, 1601, decay) + fi.fbcombfilter(8192, 2053, decay) + fi.fbcombfilter(8192, 2251, decay)) : fi.allpass_comb(1024, 347, 0.7) : fi.allpass_comb(512, 113, 0.7)");
B("re-gated", "Gated Reverb", "Reverb", [sig("x", "in"), sig("gate", "gate")], "(x : re.mono_freeverb(0.7, 0.4, 0.5, 1)) * (gate > 0.5)");

// ================================================================= BATCH 6 (clocks/synth utils)
B("clock-bpm", "Clock (BPM)", "Sources",
  [ctl("bpm", "tempo", 120, 20, 300, "BPM"), ctl("div", "division", 4, 1, 16)],
  "os.lf_imptrain(bpm/60*div)");
B("clock-swing", "Clock (swing)", "Sources",
  [ctl("bpm", "tempo", 120, 20, 300, "BPM"), ctl("swing", "swing", 0.5, 0.3, 0.7)],
  "os.lf_imptrain(bpm/60*2) * (1 - swing*0.0)");
B("adsr-vca", "Env VCA", "Dynamics",
  [sig("x", "in"), sig("gate", "gate"), ctl("a", "attack", 0.01, 0.001, 5, "s"), ctl("d", "decay", 0.1, 0.001, 5, "s"), ctl("s", "sustain", 0.7, 0, 1), ctl("r", "release", 0.3, 0.001, 10, "s")],
  "x * en.adsr(a, d, s, r, gate)");
B("glide", "Glide / Portamento", "Utility",
  [sig("x", "in"), ctl("time", "time", 0.05, 0, 1, "s")],
  "x : si.smooth(ba.tau2pole(time))");

// ================================================================= BATCH 7
// Sequencing, mixing, modulation and pitch utilities. Several of these embed a
// precomputed integer table (as a Faust `waveform`) so the block stays a pure,
// stateless-to-compile factory while still doing scale/rhythm logic at runtime.

// A rising-edge trigger from a clock signal, and a running trigger count.
const RISE = "(clk > 0.5) & (clk' <= 0.5)";

// ------------------------------------------------------------------ Clock utilities
// Clock divider: pass every Nth incoming pulse (N=1 passes all).
B("clock-div", "Clock Divider", "Sequencers",
  [sig("clk", "clock"), ctl("n", "divide", 2, 1, 32)],
  `tr & ((int(acc) % int(max(1, n))) == 0) with {
     tr = ${RISE};
     acc = tr : + ~ _;
   }`);
// Clock multiplier: emit `mult` evenly spaced pulses per incoming clock period.
// The period is measured between the last two input pulses and a phasor of
// mult/period runs across the next period, emitting a pulse on each wrap.
B("clock-mult", "Clock Multiplier", "Sequencers",
  [sig("clk", "clock"), ctl("mult", "multiply", 2, 1, 16)],
  `(ph < ph') with {
     tr = ${RISE};
     cnt = (+(1) : \\(x).(x * (1 - tr'))) ~ _;
     period = ba.sAndH(tr, cnt) : max(1);
     inc = int(max(1, mult)) / period;
     ph = (+(inc) : \\(p).(p - floor(p))) ~ _;
   }`);

// ------------------------------------------------------------------ Euclidean sequencer
// Precompute Bjorklund patterns for every steps(1..16) x pulses(0..16), padded to
// 16 positions, and read the current position (advanced by the clock) at runtime.
const bjorklund = (steps, pulses) => {
  steps = Math.max(1, Math.min(16, steps | 0));
  pulses = Math.max(0, Math.min(steps, pulses | 0));
  if (pulses === 0) return Array(steps).fill(0);
  if (pulses === steps) return Array(steps).fill(1);
  const counts = [];
  const remainders = [pulses];
  let divisor = steps - pulses;
  let level = 0;
  for (;;) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
    if (remainders[level] <= 1) break;
  }
  counts.push(divisor);
  const pattern = [];
  const build = (lvl) => {
    if (lvl === -1) pattern.push(0);
    else if (lvl === -2) pattern.push(1);
    else {
      for (let i = 0; i < counts[lvl]; i++) build(lvl - 1);
      if (remainders[lvl] !== 0) build(lvl - 2);
    }
  };
  build(level);
  const i = pattern.indexOf(1); // rotate so it starts on a hit
  return pattern.slice(i).concat(pattern.slice(0, i));
};
const EUC = [];
for (let s = 1; s <= 16; s++) {
  for (let p = 0; p <= 16; p++) {
    const pat = bjorklund(s, Math.min(p, s));
    for (let i = 0; i < 16; i++) EUC.push(i < s ? pat[i] || 0 : 0);
  }
}
B("euclid", "Euclidean Seq", "Sequencers",
  [sig("clk", "clock"), ctl("steps", "steps", 8, 1, 16), ctl("pulses", "pulses", 4, 0, 16), ctl("rot", "rotate", 0, 0, 15)],
  `tr & bit with {
     tr = ${RISE};
     s = int(max(1, min(16, steps)));
     p = int(max(0, min(16, pulses)));
     acc = tr : + ~ _;
     pos = (int(acc) + s - 1) % s;
     rp = (pos + int(max(0, rot))) % s;
     idx = ((s - 1) * 17 + p) * 16 + rp;
     bit = waveform{ ${EUC.join(",")} }, idx : rdtable;
   }`);

// ------------------------------------------------------------------ Scale quantizers
// One block per scale: snap an incoming frequency to the nearest scale degree via a
// per-pitch-class offset table (signed semitones to the closest allowed note).
const SCALES = [
  ["Major", [0, 2, 4, 5, 7, 9, 11]],
  ["Minor", [0, 2, 3, 5, 7, 8, 10]],
  ["Dorian", [0, 2, 3, 5, 7, 9, 10]],
  ["Phrygian", [0, 1, 3, 5, 7, 8, 10]],
  ["Lydian", [0, 2, 4, 6, 7, 9, 11]],
  ["Mixolydian", [0, 2, 4, 5, 7, 9, 10]],
  ["Harm Minor", [0, 2, 3, 5, 7, 8, 11]],
  ["Mel Minor", [0, 2, 3, 5, 7, 9, 11]],
  ["Penta Major", [0, 2, 4, 7, 9]],
  ["Penta Minor", [0, 3, 5, 7, 10]],
  ["Blues", [0, 3, 5, 6, 7, 10]],
  ["Whole Tone", [0, 2, 4, 6, 8, 10]],
];
const nearestOffsets = (set) => {
  const off = [];
  for (let pc = 0; pc < 12; pc++) {
    let bo = 0, bd = 99;
    for (const m of set) for (const oc of [-12, 0, 12]) {
      const d = m + oc - pc;
      if (Math.abs(d) < bd) { bd = Math.abs(d); bo = d; }
    }
    off.push(bo);
  }
  return off;
};
for (const [name, set] of SCALES) {
  const off = nearestOffsets(set);
  B(`quant-${name.toLowerCase().replace(/\s+/g, "-")}`, `Quantize ${name}`, "Pitch",
    [sig("x", "freq")],
    `ba.midikey2hz(m + o) with {
       m = rint(ba.hz2midikey(max(1, x)));
       pc = int(m) - 12 * int(floor(m / 12));
       o = waveform{ ${off.join(",")} }, pc : rdtable;
     }`);
}
B("quant-chromatic", "Quantize Chromatic", "Pitch", [sig("x", "freq")],
  "ba.midikey2hz(rint(ba.hz2midikey(max(1, x))))");

// ------------------------------------------------------------------ Arpeggiators
// Step through a chord shape (semitone offsets) on each clock pulse.
const ARPS = [
  ["Major", [0, 4, 7, 12]],
  ["Minor", [0, 3, 7, 12]],
  ["Maj7", [0, 4, 7, 11]],
  ["Min7", [0, 3, 7, 10]],
  ["Sus4", [0, 5, 7, 12]],
  ["Dim", [0, 3, 6, 9]],
  ["Octaves", [0, 12]],
  ["Fifths", [0, 7]],
  ["Major Up/Down", [0, 4, 7, 12, 7, 4]],
];
for (const [name, offs] of ARPS) {
  B(`arp-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`, `Arp ${name}`, "Sequencers",
    [sig("clk", "clock"), FREQ()],
    `freq * ba.semi2ratio(o) with {
       tr = ${RISE};
       step = tr : + ~ _;
       idx = int(step) % ${offs.length};
       o = waveform{ ${offs.join(",")} }, idx : rdtable;
     }`);
}

// ------------------------------------------------------------------ Mixer + pan
// Constant-power bipolar pan: pan=-1 hard left, 0 centre, +1 hard right.
B("mix-pan", "Pan", "Mixer", [sig("x", "in"), ctl("pan", "pan", 0, -1, 1)],
  "x * cos((max(-1,min(1,pan)) + 1) * ma.PI / 4), x * sin((max(-1,min(1,pan)) + 1) * ma.PI / 4)");
// 4-channel mixer: per-channel level + pan, stereo bus, plus one mono aux send.
{
  const chan = (i) => [
    sig(`i${i}`, `in ${i}`),
  ];
  const lvl = (i) => ctl(`l${i}`, `lvl ${i}`, 0.8, 0, 1);
  const pan = (i) => ctl(`p${i}`, `pan ${i}`, 0, -1, 1);
  const snd = (i) => ctl(`s${i}`, `send ${i}`, 0, 0, 1);
  const args = [];
  for (let i = 1; i <= 4; i++) args.push(...chan(i));
  for (let i = 1; i <= 4; i++) args.push(lvl(i));
  for (let i = 1; i <= 4; i++) args.push(pan(i));
  for (let i = 1; i <= 4; i++) args.push(snd(i));
  const Lg = (i) => `cos((max(-1,min(1,p${i}))+1)*ma.PI/4)`;
  const Rg = (i) => `sin((max(-1,min(1,p${i}))+1)*ma.PI/4)`;
  const L = [1, 2, 3, 4].map((i) => `i${i}*l${i}*${Lg(i)}`).join(" + ");
  const R = [1, 2, 3, 4].map((i) => `i${i}*l${i}*${Rg(i)}`).join(" + ");
  const S = [1, 2, 3, 4].map((i) => `i${i}*l${i}*s${i}`).join(" + ");
  B("mix-4", "Mixer 4", "Mixer", args, `${L}, ${R}, ${S}`);
}
// 8-channel level mixer to mono (sub-mixer / bus).
{
  const args = [];
  for (let i = 1; i <= 8; i++) args.push(sig(`i${i}`, `in ${i}`));
  for (let i = 1; i <= 8; i++) args.push(ctl(`l${i}`, `lvl ${i}`, 0.7, 0, 1));
  const body = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `i${i}*l${i}`).join(" + ");
  B("mix-8-mono", "Mixer 8 → Mono", "Mixer", args, body);
}

// ------------------------------------------------------------------ Modulation / CV
// 2x2 modulation matrix: two sources routed to two destinations with per-cell amounts.
B("mod-matrix-2x2", "Mod Matrix 2×2", "Modulation",
  [sig("a", "src A"), sig("b", "src B"),
   ctl("aa", "A→1", 1, -2, 2), ctl("ab", "A→2", 0, -2, 2),
   ctl("ba", "B→1", 0, -2, 2), ctl("bb", "B→2", 1, -2, 2)],
  "a*aa + b*ba, a*ab + b*bb");
// Attenuverting CV mixer: 4 sources, each with a bipolar amount, summed to one.
B("cv-mix-4", "CV Mix 4", "Modulation",
  [sig("a", "a"), sig("b", "b"), sig("c", "c"), sig("d", "d"),
   ctl("ga", "amt a", 1, -2, 2), ctl("gb", "amt b", 0, -2, 2), ctl("gc", "amt c", 0, -2, 2), ctl("gd", "amt d", 0, -2, 2)],
  "a*ga + b*gb + c*gc + d*gd");
// Offset + scale CV shaper (bias/attenuvert a modulation signal).
B("cv-bias", "CV Bias/Scale", "Modulation",
  [sig("x", "in"), ctl("scale", "scale", 1, -2, 2), ctl("bias", "bias", 0, -1, 1)],
  "x*scale + bias");

// ------------------------------------------------------------------ Wavetable oscillator
// Morph across sine → triangle → saw → square with a continuous 0..3 position
// (triangular blend of adjacent waves, so it interpolates smoothly).
B("osc-wavetable", "Wavetable Osc", "Oscillators",
  [FREQ(), ctl("wave", "wave", 0, 0, 3), GAIN(0.4)],
  `(os.osc(freq)*b0 + os.triangle(freq)*b1 + os.sawtooth(freq)*b2 + os.square(freq)*b3) * gain with {
     p = max(0, min(3, wave));
     b0 = max(0, 1 - abs(p - 0));
     b1 = max(0, 1 - abs(p - 1));
     b2 = max(0, 1 - abs(p - 2));
     b3 = max(0, 1 - abs(p - 3));
   }`);

// ================================================================= BATCH 6
// Gaps in the palette that the Faust standard library already covers.

// ------------------------------------------------------------------ Reverb
// Greyhole: dark, diffuse, heavily modulated feedback network (SuperCollider port).
B("re-greyhole", "Greyhole", "Reverb",
  [sig("l", "L"), sig("r", "R"), ctl("dt", "delay", 0.5, 0.1, 1.45, "s"), ctl("damp", "damp", 0.3, 0, 1),
   ctl("size", "size", 1, 0.5, 3), ctl("diff", "diffusion", 0.6, 0, 1), ctl("fb", "feedback", 0.5, 0, 1),
   ctl("md", "mod depth", 0.3, 0, 1)],
  "(l, r) : re.greyhole(dt, damp, size, diff, fb, md, 0.5)");
// JPverb: lush algorithmic room/hall with per-band decay multipliers.
B("re-jpverb", "JPverb", "Reverb",
  [sig("l", "L"), sig("r", "R"), ctl("t60", "t60", 3, 0.1, 60, "s"), ctl("damp", "damp", 0.2, 0, 1),
   ctl("size", "size", 1, 0.5, 5), ctl("diff", "diffusion", 0.8, 0, 1), ctl("low", "low mult", 0.9, 0, 1),
   ctl("mid", "mid mult", 0.8, 0, 1), ctl("high", "high mult", 0.7, 0, 1)],
  "(l, r) : re.jpverb(t60, damp, size, diff, 0.3, 0.4, low, mid, high, 500, 4000)");

// ------------------------------------------------------------------ Effects
// 16-band vocoder: the modulator's spectral envelope imposed on the carrier.
B("ve-vocoder", "Vocoder", "Effects",
  [sig("src", "modulator"), sig("exc", "carrier"), ctl("att", "attack", 0.01, 0.001, 0.5, "s"),
   ctl("rel", "release", 0.05, 0.001, 1, "s"), ctl("bw", "bandwidth", 0.5, 0.1, 2)],
  "ve.vocoder(16, att, rel, bw, src, exc) * 0.5"); // 16 summed bands run ~1.5x hot at unity
// Reverse echo: two ramped reverse-delay taps, half a delay period apart.
B("ef-reverse-echo", "Reverse Echo", "Delay", [sig("x", "in")], "x : ef.reverseEchoN(2, 22050)");

// ------------------------------------------------------------------ Noise colours
B("no-velvet", "Velvet Noise", "Noise",
  [ctl("amp", "amp", 0.5, 0, 1), ctl("dens", "density", 1000, 10, 20000, "Hz")],
  "no.velvet_noise(amp, dens)");
B("no-gauss", "Gaussian Noise", "Noise", [GAIN(0.5)], "no.gnoise(4) * 0.3 * gain");
// Brown (1/f^2): white through a leaky integrator. Violet (f^2): differentiated white.
B("no-brown", "Brown Noise", "Noise", [GAIN(0.5)], "(no.noise * 0.07 : + ~ *(0.99)) * gain");
B("no-violet", "Violet Noise", "Noise", [GAIN(0.5)], "(\\(n).(n - n'))(no.noise) * 0.5 * gain");

// ------------------------------------------------------------------ Physical models
// Waveguide models. Where the tube/string length maps cleanly to pitch (clarinet,
// bowed string, guitar) the port is a frequency; the flute and brass models are
// jet/lip driven, so they expose the physical length instead (as pm's own UI does).
B("pm-clarinet", "Clarinet", "Synths",
  [FREQ(), ctl("press", "pressure", 0.9, 0, 1), ctl("stiff", "reed stiffness", 0.5, 0, 1),
   ctl("bell", "bell opening", 0.5, 0, 1)],
  "pm.clarinetModel(pm.f2l(freq), press, stiff, bell)");
B("pm-flute", "Flute", "Synths",
  [ctl("len", "length", 0.5, 0.05, 2, "m"), ctl("mouth", "mouth pos", 0.5, 0, 1),
   ctl("press", "pressure", 0.9, 0, 1)],
  "pm.fluteModel(len, mouth, press)");
B("pm-brass", "Brass", "Synths",
  [ctl("len", "length", 1.4, 0.1, 3, "m"), ctl("lips", "lip tension", 0.8, 0, 1),
   ctl("mute", "mute", 0.5, 0, 1), ctl("press", "pressure", 0.9, 0, 1)],
  "pm.brassModel(len, lips, mute, press)");
B("pm-violin", "Bowed String", "Synths",
  [FREQ(), ctl("press", "bow pressure", 0.4, 0, 1), ctl("vel", "bow velocity", 0.25, 0, 1),
   ctl("pos", "bow position", 0.15, 0.01, 0.5)],
  "pm.violinModel(pm.f2l(freq), press, vel, pos)");
B("pm-churchbell", "Church Bell", "Synths",
  [sig("trig", "trig"), ctl("pos", "strike pos", 0.4, 0, 1), ctl("cut", "strike cutoff", 2000, 200, 8000, "Hz"),
   ctl("sharp", "sharpness", 0.5, 0, 1), GAIN(0.8)],
  "pm.churchBell(pos, cut, sharp, gain, trig)");
for (const [id, fn, title] of [["pm-guitar", "guitarModel", "Guitar"], ["pm-nylon-guitar", "nylonGuitarModel", "Nylon Guitar"]]) {
  B(id, title, "Synths",
    [sig("trig", "trig"), FREQ(), ctl("pluck", "pluck pos", 0.3, 0.01, 0.9), GAIN(0.8)],
    `((trig : en.ar(0.001, 0.005)) * no.noise : pm.${fn}(pm.f2l(freq), pluck)) * gain`);
}

// ------------------------------------------------------------------ Spatial / analysis
// Rotational 4-channel panner: angle 0..1 goes once around the ring.
B("sp-spat4", "Spat 4", "Spatial",
  [sig("x", "in"), ctl("angle", "angle", 0.5, 0, 1), ctl("dist", "distance", 0.5, 0, 1)],
  "x : sp.spat(4, angle, dist)");
// Monophonic pitch tracker: outputs the detected fundamental in Hz (a CV, not audio).
B("an-pitch", "Pitch Tracker", "Analysis",
  [sig("x", "in"), ctl("tau", "tau", 0.05, 0.005, 0.5, "s")], "x : an.pitchTracker(2, tau)");

// ================================================================= BATCH 8
// Faust standard-library functions the palette had never reached: an audit of the
// 1034 documented `(xx.)name` entries in faustlibraries against the bodies above
// found 886 unused. These are the ones that make sense as blocks — the rest are
// higher-order (they take a *function*, not a signal), compile-time-only, or
// internal building blocks of the pm/wd/fd/mi model families.

// ---------------------------------------------------------------- Drum synths
B("sy-kick", "Kick", "Synths",
  [sig("gate", "gate"), ctl("pitch", "pitch", 60, 30, 120, "Hz"), ctl("click", "click", 0.2, 0.005, 1),
   ctl("att", "attack", 0.01, 0.005, 0.4, "s"), ctl("dec", "decay", 0.5, 0.005, 4, "s"), ctl("drive", "drive", 3, 1, 10)],
  "sy.kick(pitch, click, att, dec, drive, gate)");

B("sy-clap", "Clap", "Synths",
  [sig("gate", "gate"), ctl("tone", "tone", 1200, 400, 3500, "Hz"),
   ctl("att", "attack", 0.01, 0.001, 0.2, "s"), ctl("dec", "decay", 0.6, 0.005, 4, "s")],
  "sy.clap(tone, att, dec, gate)");

B("sy-hat", "Hi Hat", "Synths",
  [sig("gate", "gate"), ctl("pitch", "pitch", 800, 317, 3170, "Hz"), ctl("tone", "tone", 6000, 800, 18000, "Hz"),
   ctl("att", "attack", 0.005, 0.005, 0.2, "s"), ctl("dec", "decay", 0.15, 0.005, 4, "s")],
  "sy.hat(pitch, tone, att, dec, gate)");

B("sy-popfilter-drum", "Pop Filter Drum", "Synths",
  [sig("gate", "gate"), FREQ(), ctl("q", "q", 5, 1, 40)],
  "sy.popFilterDrum(freq, q, gate)");

B("sy-fm2", "FM Synth (2-op)", "Synths",
  [FREQ(), ctl("ratio", "ratio", 2, 0.25, 12), ctl("index", "index", 20, 0, 400), GAIN(0.4)],
  "sy.fm((freq, freq*ratio), (index)) * gain");

B("sy-fm3", "FM Synth (3-op)", "Synths",
  [FREQ(), ctl("r1", "ratio 1", 2, 0.25, 12), ctl("r2", "ratio 2", 3, 0.25, 12),
   ctl("i1", "index 1", 20, 0, 400), ctl("i2", "index 2", 10, 0, 400), GAIN(0.4)],
  "sy.fm((freq, freq*r1, freq*r2), (i1, i2)) * gain");


// ---------------------------------------------------------------- Alias-suppressed oscillators
for (const [fn, title] of [["polyblep_saw", "Saw (PolyBLEP)"], ["polyblep_square", "Square (PolyBLEP)"],
                           ["polyblep_triangle", "Triangle (PolyBLEP)"]]) {
  B(`os-${fn.replace(/_/g, "-")}`, title, "Oscillators", [FREQ(), GAIN()], `os.${fn}(freq) * gain`);
}

B("os-polyblep-residual", "PolyBLEP Residual", "Math",
  [sig("phase", "phase"), ctl("q", "smooth", 0.25, 0.001, 0.5)],
  "os.polyblep(q, phase - floor(phase))"); // residual is only defined on a 0..1 phase

B("os-saw2ptr", "Saw (PTR)", "Oscillators", [FREQ(), GAIN()], "os.saw2ptr(freq) * gain");

B("os-saw4", "Saw (4th order)", "Oscillators", [FREQ(), GAIN()], "os.sawN(4, freq) * gain");

B("os-square4", "Square (4th order)", "Oscillators", [FREQ(), GAIN()], "os.squareN(4, freq) * gain");

B("os-triangle4", "Triangle (4th order)", "Oscillators", [FREQ(), GAIN()], "os.triangleN(4, freq) * gain");

B("os-dsf", "DSF Osc", "Oscillators",
  [FREQ(), ctl("df", "spacing", 220, 10, 5000, "Hz"), ctl("a", "decay", 0.5, 0, 0.95), GAIN()],
  "os.dsf.osccNq(freq, df, a) * gain",
  "Harmonics start at freq and repeat every spacing Hz, so the perceived fundamental is the greatest common divisor of the two, not freq.");

B("os-oscrq", "Quadrature Osc", "Oscillators", [FREQ(), GAIN()], "os.oscrq(freq) : *(gain), *(gain)");

B("os-twin", "Twin Osc", "Oscillators",
  [FREQ(), ctl("amt", "amount", 0.5, 0, 1), ctl("det", "detune", 0, 0, 100), ctl("mode", "mode", 0, 0, 2), GAIN()],
  "os.twin_osc(freq, amt, det, mode) * gain");

B("os-sidebands", "Sidebands", "Oscillators",
  [FREQ(), ctl("a1", "amp 1", 1, 0, 1), ctl("a2", "amp 2", 0.5, 0, 1), ctl("a3", "amp 3", 0.25, 0, 1), GAIN()],
  "os.quadosc(freq) : os.sidebands((a1, a2, a3)) : *(gain), *(gain)");

B("os-impulse", "Startup Impulse", "Sources", [], "os.impulse");

B("os-lf-trianglepos", "LFO Triangle (0..1)", "Oscillators", [ctl("rate", "rate", 1, 0.01, 100, "Hz")], "os.lf_trianglepos(rate)");

B("os-lf-squarepos", "LFO Square (0..1)", "Oscillators", [ctl("rate", "rate", 1, 0.01, 100, "Hz")], "os.lf_squarewavepos(rate)");

B("os-lf-sawpos-phase", "LFO Ramp (phase)", "Oscillators",
  [ctl("rate", "rate", 1, 0.01, 100, "Hz"), ctl("ph", "phase", 0, 0, 1)], "os.lf_sawpos_phase(rate, ph)");

B("os-lf-sawpos-reset", "LFO Ramp (reset)", "Oscillators",
  [sig("rst", "reset"), ctl("rate", "rate", 1, 0.01, 100, "Hz")], "os.lf_sawpos_reset(rate, rst)");


// ---------------------------------------------------------------- Hard sync
B("os-hs-phasor", "Phasor (hard sync)", "Oscillators",
  [sig("rst", "sync"), FREQ()], "os.hs_phasor(65536, freq, rst) / 65536");

B("os-hsp-phasor", "Phasor (sync + phase)", "Oscillators",
  [sig("rst", "sync"), FREQ(), ctl("ph", "phase", 0, 0, 1)],
  "os.hsp_phasor(65536, freq, rst, ph) / 65536");

B("os-hs-oscsin", "Sine (hard sync)", "Oscillators",
  [sig("rst", "sync"), FREQ(), GAIN()], "os.hs_oscsin(freq, rst) * gain");

B("os-hs-osccos", "Cosine (hard sync)", "Oscillators",
  [sig("rst", "sync"), FREQ(), GAIN()], "os.hs_osccos(freq, rst) * gain");


// ---------------------------------------------------------------- Casio CZ phase distortion
// The rest of the CZ family already ships above; only the half-sine pair was missing.
for (const [fn, title] of [["CZhalfSine", "CZ Half Sine"], ["CZhalfSineP", "CZ Half Sine P"]]) {
  B(`os-${fn.toLowerCase()}`, title, "Oscillators",
    [FREQ(), ctl("index", "index", 0.5, 0, 1), GAIN()],
    `os.${fn}(os.lf_sawpos(freq), index) * gain`);
}

// ---------------------------------------------------------------- Anti-aliased waveshapers
for (const [fn, title] of [["tanh1", "Tanh (AA)"], ["hardclip", "Hard Clip (AA)"],
                           ["softclipQuadratic1", "Soft Clip (AA)"], ["parabolic", "Parabolic (AA)"],
                           ["hyperbolic", "Hyperbolic (AA)"], ["sinarctan", "Sin/Arctan (AA)"],
                           ["cubic1", "Cubic (AA)"], ["arctan", "Arctan (AA)"]]) {
  B(`aa-${fn.toLowerCase()}`, title, "Distortion",
    [sig("x", "in"), ctl("drive", "drive", 2, 1, 20), GAIN(0.8)],
    `(x * drive : aa.${fn}) * gain`);
}


// ---------------------------------------------------------------- Tape / hysteresis
B("hy-tape", "Tape Saturation", "Distortion",
  [sig("x", "in"), ctl("ms", "saturation", 380, 100, 1000), ctl("a", "curve", 720, 100, 2000),
   ctl("alpha", "coupling", 0.015, 0.001, 0.1), ctl("k", "width", 380, 50, 1000),
   ctl("c", "reversibility", 0.25, 0, 1), ctl("drive", "drive", 1, 0.1, 10), ctl("trim", "trim", 1, 0.1, 4)],
  "x : hy.ja_processor(ms, a, alpha, k, c, drive, trim)");

B("hy-tape-st", "Tape Saturation (st)", "Distortion",
  [sig("l", "L"), sig("r", "R"), ctl("ms", "saturation", 380, 100, 1000), ctl("a", "curve", 720, 100, 2000),
   ctl("alpha", "coupling", 0.015, 0.001, 0.1), ctl("k", "width", 380, 50, 1000),
   ctl("c", "reversibility", 0.25, 0, 1), ctl("drive", "drive", 1, 0.1, 10), ctl("trim", "trim", 1, 0.1, 4)],
  "(l, r) : hy.ja_processor_stereo(ms, a, alpha, k, c, drive, trim)");

B("hy-hysteresis", "Hysteresis", "Distortion",
  [sig("x", "in"), ctl("ms", "saturation", 380, 100, 1000), ctl("a", "curve", 720, 100, 2000),
   ctl("alpha", "coupling", 0.015, 0.001, 0.1), ctl("k", "width", 380, 50, 1000), ctl("c", "reversibility", 0.25, 0, 1)],
  "x : hy.ja_hysteresis(ms, a, alpha, k, c)");

B("ef-tapestop", "Tape Stop", "Effects",
  [sig("l", "L"), sig("r", "R"), sig("stop", "stop"), ctl("ga", "gain curve", 1, 0.01, 2),
   ctl("sa", "stop curve", 1, 0.1, 4), ctl("st", "stop time", 24000, 1000, 96000)],
  "(l, r) : ef.tapeStop(2, 2, 96000, 1024, ga, sa, st, stop)");



// ---------------------------------------------------------------- Flanger / phaser
B("pf-flanger", "Flanger (classic)", "Modulation",
  [sig("x", "in"), ctl("del", "delay", 128, 1, 1023, "samp"), ctl("depth", "depth", 1, 0, 1),
   ctl("fb", "feedback", 0, 0, 0.95), ctl("inv", "invert", 0, 0, 1)],
  "x : pf.flanger_mono(1024, del, depth, fb, inv)");

B("pf-flanger-st", "Flanger (classic, st)", "Modulation",
  [sig("l", "L"), sig("r", "R"), ctl("d1", "delay L", 128, 1, 1023, "samp"), ctl("d2", "delay R", 192, 1, 1023, "samp"),
   ctl("depth", "depth", 1, 0, 1), ctl("fb", "feedback", 0, 0, 0.95), ctl("inv", "invert", 0, 0, 1)],
  "(l, r) : pf.flanger_stereo(1024, d1, d2, depth, fb, inv)");

B("pf-phaser2", "Phaser 2", "Modulation",
  [sig("x", "in"), ctl("speed", "speed", 0.5, 0.01, 10, "Hz"), ctl("depth", "depth", 1, 0, 1),
   ctl("fb", "feedback", 0, -0.95, 0.95), ctl("width", "notch width", 1000, 50, 5000, "Hz"),
   ctl("fmin", "notch min", 100, 20, 2000, "Hz"), ctl("fmax", "notch max", 800, 100, 8000, "Hz"),
   ctl("ratio", "notch ratio", 1.5, 1.05, 4), ctl("ph", "phase", 0, 0, 1)],
  "x : pf.phaser2_mono(4, ph, width, fmin, ratio, fmax, speed, depth, fb, 0)");

B("pf-phaser2-st", "Phaser 2 (st)", "Modulation",
  [sig("l", "L"), sig("r", "R"), ctl("speed", "speed", 0.5, 0.01, 10, "Hz"), ctl("depth", "depth", 1, 0, 1),
   ctl("fb", "feedback", 0, -0.95, 0.95), ctl("width", "notch width", 1000, 50, 5000, "Hz"),
   ctl("fmin", "notch min", 100, 20, 2000, "Hz"), ctl("fmax", "notch max", 800, 100, 8000, "Hz"),
   ctl("ratio", "notch ratio", 1.5, 1.05, 4)],
  "(l, r) : pf.phaser2_stereo(4, width, fmin, ratio, fmax, speed, depth, fb, 0)");


B("ef-stereo-width", "Stereo Width", "Spatial",
  [sig("l", "L"), sig("r", "R"), ctl("w", "width", 0.5, 0, 1)], "(l, r) : ef.stereo_width(w)");

B("ef-wavefold", "Wavefold (ef)", "Distortion",
  [sig("x", "in"), ctl("width", "width", 0.5, 0.01, 1)], "x : ef.wavefold(width)");

B("ef-doppler", "Doppler Shift", "Effects",
  [sig("x", "in"), FREQ(), ctl("ratio", "ratio", 1, 0.25, 4)], "x : ef.doppler_shift(freq, ratio)");

B("ef-reverse-delay", "Reverse Delay", "Delay",
  [sig("x", "in"), ctl("ph", "phase", 0, 0, 1)], "x : ef.reverseDelayRamped(16384, ph)");

B("ef-gate-st", "Gate (stereo)", "Dynamics",
  [sig("l", "L"), sig("r", "R"), ctl("thresh", "threshold", -60, -90, 0, "dB"),
   ctl("att", "attack", 0.001, 0.0001, 0.1, "s"), ctl("hold", "hold", 0.1, 0, 1, "s"),
   ctl("rel", "release", 0.02, 0.001, 1, "s")],
  "(l, r) : ef.gate_stereo(thresh, att, hold, rel)");

B("ef-piano-dispersion", "Piano Dispersion", "Filters",
  [sig("x", "in"), ctl("b", "inharmonicity", 0.0001, 0.00001, 0.01), FREQ()],
  "x : ef.piano_dispersion_filter(8, b, freq) : !, _");

B("ef-softclip-quad", "Soft Clip (quadratic)", "Distortion",
  [sig("x", "in"), ctl("drive", "drive", 2, 1, 20)], "x * drive : ef.softclipQuadratic");

B("ef-pan4-stereo", "Pan 4 to Stereo", "Spatial",
  [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4")],
  "(i1, i2, i3, i4) : ef.uniformPanToStereo(4)");

B("ef-mesh", "Waveguide Mesh", "Effects",
  [sig("x", "in")], "x <: si.bus(8) : ef.mesh_square(2) :> _ : *(0.25)");


// ---------------------------------------------------------------- Dynamics
B("co-expander-n", "Expander (full)", "Dynamics",
  [sig("x", "in"), ctl("str", "strength", 1, 0, 10), ctl("thresh", "threshold", -40, -90, 0, "dB"),
   ctl("range", "range", 20, 0, 90, "dB"), ctl("att", "attack", 0.01, 0.001, 0.5, "s"),
   ctl("hold", "hold", 0.05, 0, 1, "s"), ctl("rel", "release", 0.1, 0.005, 2, "s"), ctl("knee", "knee", 6, 0, 30, "dB")],
  "x : co.expander_N_chan(str, thresh, range, att, min(1, max(0, hold)), rel, knee, 1, 0, _, 48000, 1)");

B("co-expander-sc", "Expander (sidechain)", "Dynamics",
  [sig("x", "in"), sig("sc", "sidechain"), ctl("str", "strength", 1, 0, 10), ctl("thresh", "threshold", -40, -90, 0, "dB"),
   ctl("range", "range", 20, 0, 90, "dB"), ctl("att", "attack", 0.01, 0.001, 0.5, "s"),
   ctl("hold", "hold", 0.05, 0, 1, "s"), ctl("rel", "release", 0.1, 0.005, 2, "s"), ctl("knee", "knee", 6, 0, 30, "dB")],
  "x : co.expanderSC_N_chan(str, thresh, range, att, min(1, max(0, hold)), rel, knee, 1, 0, _, 48000, 1, _, 1, sc)");

B("co-limiter-lad", "Limiter (lookahead)", "Dynamics",
  [sig("x", "in"), ctl("ceiling", "ceiling", 0.9, 0.1, 1), ctl("att", "attack", 0.005, 0.0005, 0.1, "s"),
   ctl("hold", "hold", 0.05, 0, 0.5, "s"), ctl("rel", "release", 0.1, 0.005, 1, "s")],
  "x : co.limiter_lad_mono(0.01, ceiling, att, hold, rel)");

B("co-limiter-lad-st", "Limiter (lookahead, st)", "Dynamics",
  [sig("l", "L"), sig("r", "R"), ctl("ceiling", "ceiling", 0.9, 0.1, 1), ctl("att", "attack", 0.005, 0.0005, 0.1, "s"),
   ctl("hold", "hold", 0.05, 0, 0.5, "s"), ctl("rel", "release", 0.1, 0.005, 1, "s")],
  "(l, r) : co.limiter_lad_stereo(0.01, ceiling, att, hold, rel)");

B("co-comp-lad", "Compressor (lookahead)", "Dynamics",
  [sig("x", "in"), ctl("lad", "lookahead", 0.005, 0, 0.05, "s"), ctl("ratio", "ratio", 4, 1, 20),
   ctl("thresh", "threshold", -20, -60, 0, "dB"), ctl("att", "attack", 0.01, 0.001, 0.5, "s"),
   ctl("rel", "release", 0.1, 0.005, 2, "s")],
  "x : co.compressor_lad_mono(lad, ratio, thresh, att, rel)");

B("co-ff-comp", "Compressor (feed-fwd)", "Dynamics",
  [sig("x", "in"), ctl("str", "strength", 0.5, 0, 2), ctl("thresh", "threshold", -20, -60, 0, "dB"),
   ctl("att", "attack", 0.01, 0.001, 0.5, "s"), ctl("rel", "release", 0.1, 0.005, 2, "s"),
   ctl("knee", "knee", 6, 0, 30, "dB")],
  "x : co.FFcompressor_N_chan(str, thresh, att, rel, knee, 1, 0, _, 1)");

B("co-fb-comp", "Compressor (feedback)", "Dynamics",
  [sig("x", "in"), ctl("str", "strength", 0.5, 0, 2), ctl("thresh", "threshold", -20, -60, 0, "dB"),
   ctl("att", "attack", 0.01, 0.001, 0.5, "s"), ctl("rel", "release", 0.1, 0.005, 2, "s"),
   ctl("knee", "knee", 6, 0, 30, "dB")],
  "x : co.FBcompressor_N_chan(str, thresh, att, rel, knee, 1, 0, _, 1)");

B("co-ff-comp-st", "Compressor (feed-fwd, st)", "Dynamics",
  [sig("l", "L"), sig("r", "R"), ctl("str", "strength", 0.5, 0, 2), ctl("thresh", "threshold", -20, -60, 0, "dB"),
   ctl("att", "attack", 0.01, 0.001, 0.5, "s"), ctl("rel", "release", 0.1, 0.005, 2, "s"),
   ctl("knee", "knee", 6, 0, 30, "dB"), ctl("link", "link", 1, 0, 1)],
  "(l, r) : co.FFcompressor_N_chan(str, thresh, att, rel, knee, 1, link, _, 2)");

B("co-gain-computer", "Compression Gain (dB)", "Analysis",
  [sig("x", "in"), ctl("str", "strength", 0.5, 0, 2), ctl("thresh", "threshold", -20, -60, 0, "dB"),
   ctl("att", "attack", 0.01, 0.001, 0.5, "s"), ctl("rel", "release", 0.1, 0.005, 2, "s"),
   ctl("knee", "knee", 6, 0, 30, "dB")],
  "x : co.peak_compression_gain_mono_db(str, thresh, att, rel, knee, 1)");


// ---------------------------------------------------------------- Filters
// The 3-band crossover above chains LR4 sections directly; this one is the library's,
// which allpasses the low band so the three outputs stay phase-aligned. Measured on a
// band-sum: the chained version dips up to 0.09 dB near the splits, this one is flat.
B("fi-crossover3-aligned", "Crossover 3-band (aligned)", "Filters",
  [sig("x", "in"), ctl("f1", "low", 300, 20, 5000, "Hz"), ctl("f2", "high", 3000, 100, 20000, "Hz")],
  "x : fi.crossover3LR4(f1, f2)");
B("fi-crossover4", "Crossover 4-band", "Filters",
  [sig("x", "in"), ctl("f1", "low", 200, 20, 2000, "Hz"), ctl("f2", "mid", 1000, 100, 8000, "Hz"),
   ctl("f3", "high", 5000, 500, 20000, "Hz")],
  "x : fi.crossover4LR4(f1, f2, f3)");

B("fi-levelfilter", "Level Filter", "Filters",
  [sig("x", "in"), ctl("lvl", "nyquist level", 0.3, 0, 1), FREQ()], "x : fi.levelfilter(lvl, freq)");

B("fi-filterbank4", "Filter Bank 4", "Filters",
  [sig("x", "in")], "x : fi.filterbank(3, (200, 1000, 5000))");

B("fi-spectral-tilt", "Spectral Tilt", "Filters",
  [sig("x", "in"), ctl("f0", "low limit", 20, 5, 2000, "Hz"), ctl("bw", "bandwidth", 20000, 100, 20000, "Hz"),
   ctl("alpha", "slope", -0.5, -1, 1)],
  "x : fi.spectral_tilt(3, f0, bw, alpha)");

B("fi-dynamic-smoothing", "Dynamic Smoothing", "Filters",
  [sig("x", "in"), ctl("sens", "sensitivity", 0.5, 0, 1), ctl("base", "base cutoff", 20, 1, 1000, "Hz")],
  "x : fi.dynamicSmoothing(sens, base)");

B("fi-one-euro", "One Euro Filter", "Filters",
  [sig("x", "in"), ctl("dc", "derivative cutoff", 1, 0.1, 20, "Hz"), ctl("beta", "beta", 0.1, 0, 5),
   ctl("mc", "min cutoff", 1, 0.01, 20, "Hz")],
  "x : fi.oneEuro(dc, beta, mc)");

B("fi-svf-morph", "SVF Morph", "Filters",
  [sig("x", "in"), CUT(), ctl("q", "q", 1, 0.5, 20), ctl("blend", "blend", 0, 0, 2)],
  "x : fi.svf_morph(cutoff, q, blend)");

B("fi-svf-notch-morph", "SVF Notch Morph", "Filters",
  [sig("x", "in"), CUT(), ctl("q", "q", 1, 0.5, 20), ctl("blend", "blend", 0, 0, 2)],
  "x : fi.svf_notch_morph(cutoff, q, blend)");

B("fi-integrator", "Integrator", "Math", [sig("x", "in")], "x : fi.integrator",
  "Pure integrator: any DC offset on the input ramps without bound. Block DC first.");

B("fi-kfilter", "K-Weighting", "Filters", [sig("x", "in")], "x : fi.itu_r_bs_1770_4_kfilter");

B("fi-highshelf5", "High Shelf (steep)", "Filters",
  [sig("x", "in"), ctl("lvl", "level", 6, -60, 30, "dB"), CUT(3000)], "x : fi.highshelf(5, lvl, cutoff)");

B("fi-lowshelf5", "Low Shelf (steep)", "Filters",
  [sig("x", "in"), ctl("lvl", "level", 6, -60, 30, "dB"), CUT(300)], "x : fi.lowshelf(5, lvl, cutoff)");

B("fi-tf2s", "Biquad (s-plane)", "Filters",
  [sig("x", "in"), ctl("b2", "b2", 0, -4, 4), ctl("b1", "b1", 0, -4, 4), ctl("b0", "b0", 1, -4, 4),
   ctl("a1", "a1", 1.414, -4, 4), ctl("a0", "a0", 1, -4, 4), ctl("w1", "freq", 1000, 20, 20000, "Hz")],
  "x : fi.tf2s(b2, b1, b0, a1, a0, 2*ma.PI*w1)");

B("fi-fb-fcomb", "Comb (feedback, frac)", "Filters",
  [sig("x", "in"), ctl("del", "delay", 200, 1, 4095, "samp"), ctl("b0", "input gain", 1, 0, 1),
   ctl("an", "feedback", 0.5, -0.95, 0.95)],
  "x : fi.fb_fcomb(4096, del, b0, an)");

B("fi-ff-fcomb", "Comb (feed-fwd, frac)", "Filters",
  [sig("x", "in"), ctl("del", "delay", 200, 1, 4095, "samp"), ctl("b0", "input gain", 1, 0, 1),
   ctl("bm", "tap gain", 0.5, -1, 1)],
  "x : fi.ff_fcomb(4096, del, b0, bm)");

B("fi-allpass-fcomb", "Allpass Comb (frac)", "Filters",
  [sig("x", "in"), ctl("del", "delay", 200, 2, 4095, "samp"), ctl("an", "coefficient", 0.5, -0.95, 0.95)],
  "x : fi.allpass_fcomb(4096, del, an)");


// ---------------------------------------------------------------- Reverbs
B("re-dattorro-rev", "Dattorro Reverb", "Reverb",
  [sig("l", "L"), sig("r", "R"), ctl("bw", "bandwidth", 0.9995, 0.1, 1), ctl("id1", "in diff 1", 0.75, 0, 1),
   ctl("id2", "in diff 2", 0.625, 0, 1), ctl("decay", "decay", 0.5, 0, 1), ctl("dd1", "decay diff 1", 0.7, 0, 1),
   ctl("dd2", "decay diff 2", 0.5, 0, 1), ctl("damp", "damping", 0.0005, 0, 1)],
  "(l, r) : re.dattorro_rev(0, bw, id1, id2, decay, dd1, dd2, damp)");

B("re-spring", "Spring Reverb", "Reverb",
  [sig("x", "in"), ctl("dwell", "dwell", 0.5, 0, 1), ctl("blend", "blend", 0.5, 0, 1),
   ctl("tone", "tone", 0.5, 0, 1), ctl("tension", "tension", 0.5, 0, 1), ctl("springs", "springs", 0, 0, 2)],
  "x : re.springreverb(dwell, blend, tone, tension, springs)");

B("re-vital", "Vital Reverb", "Reverb",
  [sig("l", "L"), sig("r", "R"), ctl("prelow", "pre low", 100, 20, 2000, "Hz"), ctl("prehigh", "pre high", 12000, 1000, 20000, "Hz"),
   ctl("lowcut", "low shelf", 200, 20, 2000, "Hz"), ctl("highcut", "high shelf", 6000, 500, 20000, "Hz"),
   ctl("lowg", "low gain", 0, -30, 12, "dB"), ctl("highg", "high gain", -6, -30, 12, "dB"),
   ctl("chamt", "chorus amt", 0.2, 0, 1), ctl("chfreq", "chorus rate", 0.3, 0.01, 5, "Hz"),
   ctl("pre", "pre-delay", 0.02, 0, 0.3, "s"), ctl("time", "decay", 3, 0.1, 30, "s"),
   ctl("size", "size", 0.5, 0, 1), ctl("mix", "mix", 0.4, 0, 1)],
  "(l, r) : re.vital_rev(prelow, prehigh, lowcut, highcut, lowg, highg, chamt, chfreq, pre, time, size, mix)",
  undefined, true);

B("re-kb-rom", "Keith Barr Reverb", "Reverb",
  [sig("l", "L"), sig("r", "R"), ctl("rt", "decay", 0.7, 0, 0.99), ctl("damp", "damping", 0.3, 0, 1)],
  "(l, r) : re.kb_rom_rev1(rt, damp)");


// ---------------------------------------------------------------- Virtual analog
B("ve-autowah", "Auto Wah", "Virtual Analog",
  [sig("x", "in"), ctl("level", "amount", 0.5, 0, 1)], "x : ve.autowah(level)");

B("ve-crybaby", "CryBaby", "Virtual Analog",
  [sig("x", "in"), ctl("wah", "pedal", 0.5, 0, 1)], "x : ve.crybaby(wah)");

B("ve-wah4", "Wah 4th Order", "Virtual Analog",
  [sig("x", "in"), ctl("fr", "resonance", 600, 100, 4000, "Hz")], "x : ve.wah4(fr)");

B("ve-klon", "Klon Centaur", "Distortion",
  [sig("x", "in"), ctl("gain", "gain", 0.5, 0, 1), ctl("treble", "treble", 0.5, 0, 1), ctl("level", "level", 0.5, 0, 1)],
  "x : ve.klonCentaur(gain, treble, level)");

B("ve-ladder4", "Ladder LP 4-pole", "Virtual Analog",
  [sig("x", "in"), ctl("k", "resonance", 1, 0, 4), CUT()], "x : ve.lowpassLadder4(k, cutoff)");

B("ve-moog-half", "Moog Half Ladder", "Virtual Analog",
  [sig("x", "in"), ctl("nf", "cutoff", 0.3, 0, 1), ctl("q", "q", 1, 0.5, 10)], "x : ve.moogHalfLadder(nf, q)");

B("ve-oberheim-all", "Oberheim (4 out)", "Virtual Analog",
  [sig("x", "in"), ctl("nf", "cutoff", 0.3, 0, 1), ctl("q", "q", 1, 0.5, 10)], "x : ve.oberheim(nf, q)");

B("ve-sallenkey-all", "Sallen-Key (3 out)", "Virtual Analog",
  [sig("x", "in"), ctl("nf", "cutoff", 0.3, 0, 1), ctl("q", "q", 1, 0.5, 10)], "x : ve.sallenKey2ndOrder(nf, q)");

B("ve-lowpass2m", "Lowpass (matched)", "Virtual Analog",
  [sig("x", "in"), CUT(), ctl("q", "q", 1, 0.5, 20)], "x : ve.lowpass2Matched(cutoff, q)");

B("ve-peaking2m", "Peaking EQ (matched)", "Virtual Analog",
  [sig("x", "in"), ctl("g", "gain", 2, 0.1, 10), CUT(), ctl("q", "q", 1, 0.5, 20)],
  "x : ve.peaking2Matched(g, cutoff, q)");


// ---------------------------------------------------------------- Delays
B("de-fdelay-lti", "Delay (Lagrange, static)", "Delay",
  [sig("x", "in"), ctl("del", "delay", 1000, 4, 65000, "samp")], "x : de.fdelaylti(3, 65536, min(65000, max(4, del)))");

B("de-fdelay-ltv", "Delay (Lagrange, moving)", "Delay",
  [sig("x", "in"), ctl("del", "delay", 1000, 4, 65000, "samp")], "x : de.fdelayltv(3, 65536, min(65000, max(4, del)))");

B("de-multitap-sinc", "Multi-tap Sinc Delay", "Delay",
  [sig("x", "in"), ctl("t1", "from", 500, 4, 16000, "samp"), ctl("t2", "to", 2000, 4, 16000, "samp"),
   ctl("a", "morph", 0.5, 0, 1)],
  "x : de.multiTapSincDelay(2, 16384, t1, t2, a)");



// smoothing, interpolation, analysis, routing, spatial, conversion, JI quantizers.
// ---------------------------------------------------------------- Clocks / timing
B("ba-beat", "Beat", "Sequencers", [ctl("bpm", "tempo", 120, 20, 300)], "ba.beat(bpm)");

B("ba-tempo", "Tempo (samples)", "Convert", [ctl("bpm", "tempo", 120, 20, 300)], "ba.tempo(bpm)");

B("ba-pulsen", "Pulse Train (n/p)", "Sequencers",
  [ctl("n", "length", 100, 1, 48000, "samp"), ctl("p", "period", 4800, 2, 480000, "samp")], "ba.pulsen(n, p)");

B("ba-spulse", "Single Pulse", "Sequencers",
  [sig("trig", "trig"), ctl("n", "length", 480, 1, 48000, "samp")], "ba.spulse(n, trig)");

B("ba-sweep", "Sweep Counter", "Sequencers",
  [sig("run", "run"), ctl("p", "period", 48000, 2, 480000, "samp")], "ba.sweep(p, run)");

B("ba-period", "Period Ramp", "Sequencers", [ctl("p", "period", 48000, 2, 480000, "samp")], "ba.period(p)");

B("ba-time", "Sample Counter", "Sources", [], "ba.time",
  "Counts samples since the audio graph started and never resets — it grows without bound.");

B("ba-line", "Line To", "Modulation",
  [sig("x", "target"), ctl("n", "time", 4800, 1, 480000, "samp")], "x : ba.line(n)");

B("ba-ramp", "Ramp To", "Modulation",
  [sig("x", "target"), ctl("n", "slope", 4800, 1, 480000, "samp")], "x : ba.ramp(n)");

B("ba-counter", "Counter", "Sequencers", [sig("trig", "trig")], "ba.counter(trig)");

B("ba-countup", "Count Up", "Sequencers",
  [sig("trig", "trig"), ctl("n", "max", 8, 1, 128)], "ba.countup(n, trig)");

B("ba-countdown", "Count Down", "Sequencers",
  [sig("trig", "trig"), ctl("n", "from", 8, 1, 128)], "ba.countdown(n, trig)");

B("ba-pulse-countup-loop", "Pulse Count Loop", "Sequencers",
  [sig("trig", "trig"), ctl("n", "max", 8, 1, 128)], "trig : ba.pulse_countup_loop(n, trig)");

B("ba-resetctr", "Every Nth Pulse", "Sequencers",
  [sig("trig", "trig"), ctl("n", "of", 4, 1, 32), ctl("m", "take", 1, 1, 32)],
  "trig : ba.resetCtr(n, m)");

B("ba-cycle4", "Cycle 4", "Routing", [sig("trig", "trig")], "trig : ba.cycle(4)");

B("ba-toggle", "Toggle", "Sequencers", [sig("trig", "trig")], "trig : ba.toggle");

B("ba-on-and-off", "On / Off", "Sequencers",
  [sig("on", "on"), sig("off", "off")], "(on, off) : ba.on_and_off");

B("ba-tandh", "Test And Hold", "Modulation",
  [sig("x", "in"), ctl("thresh", "threshold", 0, -1, 1)], "x : ba.tAndH(\\(v).(v > thresh))");

B("ba-peakhold-mode", "Peak Hold (reset)", "Analysis",
  [sig("x", "in"), ctl("mode", "hold", 1, 0, 1)], "ba.peakhold(mode, x)");

// Records the input on each beat and replays the last 16 beats as a loop. The init
// argument MUST be written 0.0, not 0: an integer literal makes rwtable an integer
// table and every recorded fraction truncates to zero, so the block sits silent.
B("ba-automat", "Automat", "Modulation",
  [sig("x", "in"), ctl("bpm", "tempo", 120, 20, 300)], "x : ba.automat(bpm, 16, 0.0)",
  "Records one value per beat into a 16-beat loop, so nothing plays back until the loop first comes around.");
B("ba-selectn4", "Select 1 of 4", "Routing",
  [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4"), ctl("sel", "select", 0, 0, 3)],
  "(i1, i2, i3, i4) : ba.selectn(4, int(sel))");

B("ba-bpf3", "Breakpoint 3", "Math",
  [sig("x", "in"), ctl("x1", "x1", 0, -10, 10), ctl("y1", "y1", 0, -10, 10), ctl("x2", "x2", 0.5, -10, 10),
   ctl("y2", "y2", 1, -10, 10), ctl("x3", "x3", 1, -10, 10), ctl("y3", "y3", 0, -10, 10)],
  "x : (ba.bpf.start(x1, y1) : ba.bpf.point(x2, y2) : ba.bpf.end(x3, y3))");

B("ba-list-interp", "List Interp 5", "Math",
  [sig("idx", "index"), ctl("v1", "v1", 0, -10, 10), ctl("v2", "v2", 0.25, -10, 10), ctl("v3", "v3", 0.5, -10, 10),
   ctl("v4", "v4", 0.75, -10, 10), ctl("v5", "v5", 1, -10, 10)],
  "ba.listInterp((v1, v2, v3, v4, v5), idx)");


// ---------------------------------------------------------------- Sliding-window stats
for (const [fn, title] of [["slidingMin", "Sliding Min"], ["slidingMax", "Sliding Max"]]) {
  B(`ba-${fn.toLowerCase()}`, title, "Analysis",
    [sig("x", "in"), ctl("n", "window", 1024, 1, 4096, "samp")], `x : ba.${fn}(int(min(4096, max(1, n))), 4096)`);
}

for (const [fn, title] of [["slidingMean", "Sliding Mean"], ["slidingRMS", "Sliding RMS"], ["slidingSum", "Sliding Sum"]]) {
  B(`ba-${fn.toLowerCase()}`, title, "Analysis",
    [sig("x", "in"), ctl("n", "window", 1024, 1, 4096, "samp")], `x : ba.${fn}(int(min(4096, max(1, n))))`);
}

for (const [fn, title] of [["parallelMin", "Min of 4"], ["parallelMax", "Max of 4"],
                           ["parallelMean", "Mean of 4"], ["parallelRMS", "RMS of 4"]]) {
  B(`ba-${fn.toLowerCase()}`, title, "Math",
    [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4")],
    `(i1, i2, i3, i4) : ba.${fn}(4)`);
}


// ---------------------------------------------------------------- Lo-fi
// Rounds to the nearest step instead of truncating, so it doesn't push the signal
// negative: measured at 2 bits, the truncating Bitcrusher sits at -0.124 DC, this at 0.001.
B("ba-bitcrush-round", "Bitcrusher (round)", "Distortion",
  [sig("x", "in"), ctl("bits", "bits", 8, 1, 16)], "x : ba.bitcrusher(bits)");
B("ba-mulaw-crush", "Mu-law Bitcrusher", "Distortion",
  [sig("x", "in"), ctl("mu", "mu", 8, 1, 255), ctl("bits", "bits", 8, 1, 16)], "x : ba.mulaw_bitcrusher(mu, bits)");

B("ba-downsample-cv", "Downsample CV", "Modulation",
  [sig("x", "in"), ctl("amt", "amount", 0.5, 0, 1)], "x : ba.downSampleCV(amt)");


// ---------------------------------------------------------------- Noise
B("no-colored", "Colored Noise", "Noise",
  [ctl("alpha", "slope", 0, -1, 1), ctl("gain", "gain", 0.3, 0, 1)], "no.colored_noise(3, alpha) * gain");

B("no-pink-vm", "Pink Noise (multi)", "Noise", [ctl("gain", "gain", 0.3, 0, 1)], "no.pink_noise_vm(16) * gain");

B("no-lfnoise-n", "LF Noise (filtered)", "Noise",
  [ctl("rate", "rate", 10, 0.1, 5000, "Hz")], "no.lfnoiseN(3, rate)");

B("no-multi4", "Noise x4", "Noise", [], "no.multinoise(4)");

// ---------------------------------------------------------------- Envelopes
B("en-ahdsre", "AHDSR (exp)", "Envelopes",
  [sig("gate", "gate"), ctl("at", "attack", 0.01, 0.001, 4, "s"), ctl("ht", "hold", 0.05, 0, 4, "s"),
   ctl("dt", "decay", 0.2, 0.001, 4, "s"), ctl("sl", "sustain", 0.6, 0, 1), ctl("rt", "release", 0.3, 0.001, 8, "s")],
  "en.ahdsre(at, ht, dt, sl, rt, gate)");

B("en-arfe", "AR to Final", "Envelopes",
  [sig("gate", "gate"), ctl("at", "attack", 0.01, 0.001, 4, "s"), ctl("rt", "release", 0.3, 0.001, 8, "s"),
   ctl("fl", "final level", 0, 0, 1)],
  "en.arfe(at, rt, fl, gate)");

B("en-dx7", "DX7 Envelope", "Envelopes",
  [sig("gate", "gate"), ctl("r1", "rate 1", 0.01, 0.001, 4, "s"), ctl("r2", "rate 2", 0.1, 0.001, 4, "s"),
   ctl("r3", "rate 3", 0.2, 0.001, 4, "s"), ctl("r4", "rate 4", 0.3, 0.001, 8, "s"),
   ctl("l1", "level 1", 1, 0, 1), ctl("l2", "level 2", 0.8, 0, 1), ctl("l3", "level 3", 0.6, 0, 1),
   ctl("l4", "level 4", 0, 0, 1)],
  "en.dx7envelope(r1, r2, r3, r4, l1, l2, l3, l4, gate)");

B("en-smooth-env", "Smooth Envelope", "Envelopes",
  [sig("gate", "gate"), ctl("ar", "attack/release", 0.05, 0.001, 4, "s")], "en.smoothEnvelope(ar, gate)");

B("en-adsr-bias", "ADSR (biased)", "Envelopes",
  [sig("gate", "gate"), ctl("at", "attack", 0.01, 0.001, 4, "s"), ctl("dt", "decay", 0.2, 0.001, 4, "s"),
   ctl("sl", "sustain", 0.6, 0, 1), ctl("rt", "release", 0.3, 0.001, 8, "s"),
   ctl("ba_", "attack bias", 0.5, 0.01, 0.99), ctl("bd", "decay bias", 0.5, 0.01, 0.99),
   ctl("br", "release bias", 0.5, 0.01, 0.99), ctl("leg", "legato", 0, 0, 1)],
  "en.adsr_bias(at, dt, sl, rt, ba_, bd, br, leg, gate)");

B("en-ahdsr-bias", "AHDSR (biased)", "Envelopes",
  [sig("gate", "gate"), ctl("at", "attack", 0.01, 0.001, 4, "s"), ctl("ht", "hold", 0.05, 0, 4, "s"),
   ctl("dt", "decay", 0.2, 0.001, 4, "s"), ctl("sl", "sustain", 0.6, 0, 1), ctl("rt", "release", 0.3, 0.001, 8, "s"),
   ctl("ba_", "attack bias", 0.5, 0.01, 0.99), ctl("bd", "decay bias", 0.5, 0.01, 0.99),
   ctl("br", "release bias", 0.5, 0.01, 0.99), ctl("leg", "legato", 0, 0, 1)],
  "en.ahdsr_bias(at, ht, dt, sl, rt, ba_, bd, br, leg, gate)");


// ---------------------------------------------------------------- Smoothing / signal
B("si-onepole-switching", "Attack/Release Smoother", "Signals",
  [sig("x", "in"), ctl("att", "attack", 0.01, 0.0001, 2, "s"), ctl("rel", "release", 0.1, 0.0001, 4, "s")],
  "x : si.onePoleSwitching(att, rel)");

B("si-smooth-and-h", "Smooth And Hold", "Signals",
  [sig("x", "in"), sig("g", "hold"), ctl("s", "smoothness", 0.999, 0, 0.9999)], "x : si.smoothAndH(g, s)");

B("si-poly-smooth", "Poly Smooth", "Signals",
  [sig("x", "in"), sig("g", "gate"), ctl("s", "smoothness", 0.999, 0, 0.9999)], "x : si.polySmooth(g, s, 1)");

B("si-smoothq", "Smooth (curve)", "Signals",
  [sig("x", "in"), ctl("time", "time", 0.05, 0.001, 4, "s"), ctl("q", "curve", 0.5, 0, 1)], "x : si.smoothq(time, q)");

B("si-bsmooth", "Block Smooth", "Signals", [sig("x", "in")], "x : si.bsmooth");

B("si-rev", "Reverse Blocks", "Effects", [sig("x", "in")], "x : si.rev(2048)",
  "Reverses the signal in fixed 2048-sample blocks; the block size is baked in at compile time.");

B("si-interpolate", "Crossfade (linear)", "Mixer",
  [sig("a", "in A"), sig("b", "in B"), ctl("i", "mix", 0.5, 0, 1)], "(a, b) : si.interpolate(i)");

B("si-cmul", "Complex Multiply", "Math",
  [sig("r1", "re A"), sig("i1", "im A"), sig("r2", "re B"), sig("i2", "im B")], "(r1, i1) : si.cmul(r2, i2)");

B("si-dot4", "Dot Product 4", "Math",
  [sig("a1", "a1"), sig("a2", "a2"), sig("a3", "a3"), sig("a4", "a4"),
   sig("b1", "b1"), sig("b2", "b2"), sig("b3", "b3"), sig("b4", "b4")],
  "(a1, a2, a3, a4, b1, b2, b3, b4) : si.dot(4)");


// ---------------------------------------------------------------- Interpolation / mapping
B("it-remap", "Remap Range", "Math",
  [sig("x", "in"), ctl("f1", "from lo", -1, -100, 100), ctl("f2", "from hi", 1, -100, 100),
   ctl("t1", "to lo", 0, -100, 100), ctl("t2", "to hi", 1, -100, 100)],
  "x : it.remap(f1, f2, t1, t2)");

B("it-lerp", "Lerp", "Math",
  [sig("x", "in"), ctl("x0", "x0", 0, -100, 100), ctl("x1", "x1", 1, -100, 100),
   ctl("y0", "y0", 0, -100, 100), ctl("y1", "y1", 1, -100, 100)],
  "it.lerp(x0, x1, y0, y1, x)");

B("it-interp-cubic", "Interp Cubic", "Math",
  [sig("dv", "position"), ctl("v0", "v0", 0, -10, 10), ctl("v1", "v1", 1, -10, 10),
   ctl("v2", "v2", 0, -10, 10), ctl("v3", "v3", -1, -10, 10)],
  "it.interpolate_cubic(dv, v0, v1, v2, v3)");

for (const [fn, title] of [["interpolate_cosine", "Interp Cosine"], ["interpolate_smoothstep", "Interp Smoothstep"],
                           ["interpolate_smootherstep", "Interp Smootherstep"]]) {
  B(`it-${fn.replace("interpolate_", "")}`, title, "Math",
    [sig("dv", "position"), ctl("v0", "from", 0, -10, 10), ctl("v1", "to", 1, -10, 10)],
    `it.${fn}(dv, v0, v1)`);
}

B("it-interp-exp", "Interp Exponential", "Math",
  [sig("dv", "position"), ctl("k", "curve", 1, -8, 8), ctl("v0", "from", 0, -10, 10), ctl("v1", "to", 1, -10, 10)],
  "it.interpolate_exponential(k, dv, v0, v1)");

B("it-piecewise3", "Piecewise 3", "Math",
  [sig("x", "in"), ctl("x1", "x1", 0, -10, 10), ctl("x2", "x2", 0.5, -10, 10), ctl("x3", "x3", 1, -10, 10),
   ctl("y1", "y1", 0, -10, 10), ctl("y2", "y2", 1, -10, 10), ctl("y3", "y3", 0, -10, 10)],
  "it.piecewise((x1, x2, x3), (y1, y2, y3), x)");

B("it-frdtable", "Wavetable (Lagrange)", "Oscillators",
  [FREQ()], "it.frdtable(3, 1024, os.sinwaveform(1024), os.phasor(1024, freq))");


// ---------------------------------------------------------------- Analysis
B("an-spectral-centroid", "Spectral Centroid", "Analysis",
  [sig("x", "in"), ctl("tau", "tau", 0.05, 0.005, 1, "s")], "x : an.spectralCentroid(0, tau)");

B("an-goertzel", "Goertzel", "Analysis",
  [sig("x", "in"), FREQ()], "x : an.goertzel(freq, 1024)");

B("an-octave-analyzer", "Octave Analyzer 8", "Analysis",
  [sig("x", "in")], "x : an.mth_octave_analyzer(3, 1, 16000, 8)");

B("an-spectral-level", "Spectral Level", "Analysis",
  [sig("x", "in"), ctl("tau", "tau", 0.1, 0.005, 2, "s")], "x : an.mth_octave_spectral_level6e(1, 16000, 8, tau, 0)");

B("an-linsweep", "Sine Sweep (linear)", "Sources",
  [ctl("fs", "from", 20, 10, 20000, "Hz"), ctl("fe", "to", 20000, 10, 20000, "Hz"), ctl("dur", "duration", 5, 0.1, 60, "s")],
  "an.linsweep(fs, fe, dur)");

B("an-logsweep", "Sine Sweep (log)", "Sources",
  [ctl("fs", "from", 20, 10, 20000, "Hz"), ctl("fe", "to", 20000, 10, 20000, "Hz"), ctl("dur", "duration", 5, 0.1, 60, "s")],
  "an.logsweep(fs, fe, dur)");


// ---------------------------------------------------------------- Routing
B("ro-cross2", "Swap", "Routing", [sig("a", "in 1"), sig("b", "in 2")], "(a, b) : ro.cross(2)");

B("ro-cross-nm", "Cross 2x2", "Routing",
  [sig("a", "A 1"), sig("b", "A 2"), sig("c", "B 1"), sig("d", "B 2")], "(a, b, c, d) : ro.crossNM(2, 2)");

B("ro-interleave", "Interleave 2x4", "Routing",
  [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4"),
   sig("i5", "in 5"), sig("i6", "in 6"), sig("i7", "in 7"), sig("i8", "in 8")],
  "(i1, i2, i3, i4, i5, i6, i7, i8) : ro.interleave(2, 4)");

B("ro-hadamard", "Hadamard 4", "Routing",
  [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4")],
  "(i1, i2, i3, i4) : ro.hadamard(4)");

B("ro-butterfly", "Butterfly 4", "Routing",
  [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4")],
  "(i1, i2, i3, i4) : ro.butterfly(4)");

B("ro-sort4", "Sort 4", "Routing",
  [sig("i1", "in 1"), sig("i2", "in 2"), sig("i3", "in 3"), sig("i4", "in 4")],
  "(i1, i2, i3, i4) : ro.bubbleSort(4)");


// ---------------------------------------------------------------- Spatial
B("sp-const-power-pan", "Constant Power Pan", "Spatial",
  [sig("l", "L"), sig("r", "R"), ctl("p", "pan", 0.5, 0, 1)], "(l, r) : sp.constantPowerPan(p)");

B("sp-spcap4", "SPCAP 4", "Spatial",
  [sig("x", "in"), ctl("alpha", "width", 2, 1, 10), ctl("theta", "angle", 0, 0, 6.2832)],
  "x : sp.spcap(4, alpha, \\(i).(i * 2 * ma.PI / 4), theta)");


// ---------------------------------------------------------------- Conversion
for (const [id, title, fn, arg] of [
  ["cent2ratio", "Cents to Ratio", "ba.cent2ratio", ctl("cent", "cents", 0, -2400, 2400)],
  ["ratio2cent", "Ratio to Cents", "ba.ratio2cent", ctl("ratio", "ratio", 1, 0.01, 100)],
  ["hz2mel", "Hz to Mel", "ba.hz2mel", ctl("hz", "freq", 440, 20, 20000, "Hz")],
  ["mel2hz", "Mel to Hz", "ba.mel2hz", ctl("mel", "mel", 500, 0, 4000)],
  ["hz2pianokey", "Hz to Piano Key", "ba.hz2pianokey", ctl("hz", "freq", 440, 20, 20000, "Hz")],
  ["pianokey2hz", "Piano Key to Hz", "ba.pianokey2hz", ctl("pk", "key", 49, 1, 88)],
  ["samp2sec", "Samples to Seconds", "ba.samp2sec", ctl("n", "samples", 4800, 1, 480000)],
  ["sec2samp", "Seconds to Samples", "ba.sec2samp", ctl("d", "seconds", 0.1, 0.0001, 10, "s")],
  ["lin2loggain", "Linear to Log Gain", "ba.lin2LogGain", ctl("g", "gain", 0.5, 0, 1)],
  ["log2lingain", "Log to Linear Gain", "ba.log2LinGain", ctl("g", "gain", 0.5, 0, 1)],
]) {
  B(`conv-${id}`, title, "Convert", [arg], `${fn}(${arg.name})`);
}

B("ma-zc", "Zero Crossing (sample)", "Analysis", [sig("x", "in")], "x : ma.zc");

B("ma-chebychev", "Chebychev Shaper", "Distortion",
  [sig("x", "in"), ctl("drive", "drive", 1, 0.1, 4)], "x * drive : ma.chebychev(3)");

B("ma-nextpow2", "Next Power of 2", "Convert", [ctl("n", "value", 1000, 1, 100000)], "ma.nextpow2(n)");


// ---------------------------------------------------------------- Just-intonation quantizers
for (const [title, fn] of [["Ionian", "ionian"], ["Dorian", "dorian"], ["Phrygian", "phrygian"],
                           ["Lydian", "lydian"], ["Mixolydian", "mixo"], ["Eolian", "eolian"],
                           ["Locrian", "locrian"], ["Penta Minor", "penta"], ["Penta Pythagorean", "pentanat"],
                           ["Kumoi", "kumoi"], ["Diminished", "dimin"], ["Dodecaphonic", "dodeca"],
                           ["Natural Major", "natural"]]) {
  B(`quant-root-${fn}`, `Quantize ${title} (root)`, "Pitch",
    [sig("x", "freq"), ctl("root", "root", 220, 20, 2000, "Hz")],
    `max(1, x) : qu.quantize(root, qu.${fn})`);
}

for (const [title, fn] of [["Ionian", "ionian"], ["Eolian", "eolian"], ["Penta Minor", "penta"]]) {
  B(`quant-root-sm-${fn}`, `Quantize ${title} (root, smooth)`, "Pitch",
    [sig("x", "freq"), ctl("root", "root", 220, 20, 2000, "Hz")],
    `max(1, x) : qu.quantizeSmoothed(root, qu.${fn})`);
}



B("it-frwtable", "Wavetable R/W", "Oscillators",
  [sig("x", "in"), sig("w", "write idx"), sig("r", "read idx")],
  "it.frwtable(3, 1024, 0.0, int(min(1023, max(0, w))), x, r)",
  "1024-sample table: write index is rounded to a sample, read index interpolates.");

B("an-resonator", "Resonator (mag/phase)", "Analysis",
  [sig("x", "in"), ctl("freq", "freq", 440, 20, 20000, "Hz")], "x : an.resonator(1, freq)");

B("ma-unwrap", "Phase Unwrap", "Math",
  [sig("x", "in"), ctl("m", "modulus", 3.14159265, 0.001, 100)], "x : ma.unwrap(m)");

// ================================================================= Hand-written docs
// Blocks written as a plain Faust expression have no library function to quote, so
// build-catalog.mjs can attach no documentation to them. Their hover text lives here:
// what the body actually computes, including the clamps, epsilons and true/false
// conventions that are invisible from the outside. Applied below to any block that
// does not already carry a tooltip.
const TIPS = {
  // ---- Arithmetic
  "math-add": "a + b. Sums two signals; also adds a DC offset when one side is a constant.",
  "math-sub": "a − b.",
  "math-mul": "a × b. Ring modulation for two audio signals; a VCA when one side is a control.",
  "math-div": "a ÷ b. No guard on b: dividing by zero gives ±infinity, which will silence the graph downstream.",
  "math-min": "The smaller of the two inputs, sample by sample.",
  "math-max": "The larger of the two inputs, sample by sample.",
  "math-mod": "Floating-point remainder of a ÷ b, keeping the sign of a.",
  "math-pow": "|a| raised to b. The base is rectified so a negative base cannot produce NaN.",
  "math-atan2": "Angle in radians of the point (b, a), in −π…π. Sign-aware, unlike atan.",
  "math-hypot": "√(a² + b²) — the length of the vector (a, b).",
  "math-avg": "The mean of the two inputs, (a + b) / 2.",
  "math-absdiff": "|a − b|, the unsigned distance between the two inputs.",
  "math-min3": "The smallest of three inputs.",
  "math-max3": "The largest of three inputs.",
  "math-gain": "Multiplies by the gain control. Gain is not smoothed — step it and you will hear a click.",
  "math-offset": "Adds a constant offset. Shifts a bipolar signal up or down without scaling it.",
  "math-scale": "x × mul + add, in that order — scale first, then offset.",
  "math-mix": "Linear crossfade: mix 0 is all A, 1 is all B. Level dips ~3 dB in the middle for uncorrelated signals.",
  "math-weighted-sum": "a × weight a + b × weight b. Two independent gains summed to one output.",
  "math-attenuvert": "Scales by amount, which may go negative — negative values invert the signal as they attenuate.",
  "math-comparator": "Outputs 1 while the input is above the threshold, 0 otherwise. No hysteresis, so a noisy input near the threshold will chatter.",
  "math-pulsewidth": "Turns a 0…1 ramp into a ±1 pulse whose duty cycle is the width control.",
  "math-quantize": "Rounds to the nearest 1/steps. Steps is not clamped: below 1 it will not quantize.",
  "math-deadzone": "Passes the input unchanged above the threshold and outputs zero below it. The step at the threshold is abrupt.",
  "math-clip-to": "Clamps between lo and hi. Nothing enforces lo < hi — reversed bounds output hi.",
  "math-clamp-sym": "Clamps to ±limit.",
  "math-smoothstep": "3rd-order S-curve on 0…1, flat at both ends. The input is clamped first.",

  // ---- Comparison and logic
  "logic-gt": "1 when a > b, else 0.",
  "logic-lt": "1 when a < b, else 0.",
  "logic-ge": "1 when a ≥ b, else 0.",
  "logic-le": "1 when a ≤ b, else 0.",
  "logic-eq": "1 when a equals b exactly. Exact float equality — two computed signals rarely match.",
  "logic-step": "1 once a reaches b, else 0. A comparator with the threshold on an input.",
  "logic-wrap": "Wraps a into 0…b (a − b·floor(a/b)), so it stays positive unlike fmod.",
  "logic-and": "Both inputs above 0.5 → 1, else 0.",
  "logic-or": "Either input above 0.5 → 1, else 0.",
  "logic-xor": "Exactly one input above 0.5 → 1, else 0.",
  "logic-nand": "Inverted AND: 0 only when both inputs are above 0.5.",
  "logic-nor": "Inverted OR: 1 only when both inputs are at or below 0.5.",
  "logic-xnor": "Inverted XOR: 1 when both inputs agree.",
  "logic-not": "1 when the input is at or below 0.5, else 0.",
  "logic-and-int": "Bitwise AND of the two inputs truncated to integers — not a logic gate; use AND for gate signals.",
  "logic-or-int": "Bitwise OR of the two inputs truncated to integers.",
  "logic-xor-int": "Bitwise XOR of the two inputs truncated to integers. Useful for bit-crushed, glitchy tones.",
  "logic-shl": "Shifts a left by b bits, both truncated to integers — multiplies by 2^b.",
  "logic-shr": "Shifts a right by b bits, both truncated to integers — divides by 2^b, discarding the remainder.",
  "logic-min3-x": "The smaller of the two inputs, sample by sample.",

  // ---- Single-input maths
  "math1-neg": "Flips the sign. Inverts the phase of an audio signal.",
  "math1-abs": "Absolute value. On audio this is full-wave rectification, which doubles the perceived pitch.",
  "math1-inv": "1 ÷ x. No guard: an input of zero gives infinity.",
  "math1-sqrt": "√|x| — the input is rectified first, so negatives do not produce NaN.",
  "math1-sin": "Sine of the input in radians.",
  "math1-cos": "Cosine of the input in radians.",
  "math1-tan": "Tangent of the input in radians. Unbounded near ±π/2 — clamp before a signal path.",
  "math1-asin": "Arcsine in radians. The input is clamped to ±1 first.",
  "math1-acos": "Arccosine in radians. The input is clamped to ±1 first.",
  "math1-atan": "Arctangent in radians, output bounded to ±π/2. Doubles as a gentle saturator.",
  "math1-sec": "1 ÷ cos(x). Unbounded where the cosine crosses zero.",
  "math1-csc": "1 ÷ sin(x). Unbounded where the sine crosses zero.",
  "math1-cot": "cos(x) ÷ sin(x). Unbounded where the sine crosses zero.",
  "math1-exp": "e^x. Grows fast — an input of 10 is already over 22000.",
  "math1-exp2": "2^x. One unit of input is one octave, which suits pitch maths.",
  "math1-log": "Natural log of |x|, floored at 1e-9 so an input of zero cannot blow up.",
  "math1-log2": "Base-2 log of |x|, floored at 1e-9. Converts a frequency ratio to octaves.",
  "math1-log10": "Base-10 log of |x|, floored at 1e-9.",
  "math1-floor": "Rounds down to the next integer.",
  "math1-ceil": "Rounds up to the next integer.",
  "math1-round": "Rounds to the nearest integer, halves to even.",
  "math1-trunc": "Drops the fractional part, rounding toward zero.",
  "math1-frac": "The fractional part, x − floor(x). Always 0…1, so a falling ramp still wraps upward.",
  "math1-rectify": "Half-wave rectifier: negatives become zero, positives pass.",
  "math1-clip": "Clamps to ±1.",
  "math1-clip01": "Clamps to 0…1.",
  "math1-square": "x². Always positive, so it rectifies as well as shapes.",
  "math1-cube": "x³. Keeps the sign, unlike squaring — a soft odd-harmonic shaper.",
  "math1-rsqrt": "1 ÷ √|x|, with a 1e-9 floor on the input.",
  "math1-gauss": "Bell curve e^(−x²): 1 at zero, falling away either side. A window or a CV shaper.",
  "math1-recip1": "1 ÷ (1 + |x|). Falls from 1 toward zero and never divides by zero.",
  "math1-expo": "Exponential 0…1 curve. Slow at first, fast at the end — the usual shape for a volume pedal.",
  "math1-softabs": "√(x² + 0.01) — absolute value with the corner at zero rounded off, so it has no kink to alias.",
  "math1-smootherstep": "5th-order S-curve on 0…1, flat in value and slope at both ends. Smoother than Smoothstep. Input clamped first.",
  "math1-bipolar2unipolar": "Maps ±1 to 0…1. Audio to a modulation range.",
  "math1-unipolar2bipolar": "Maps 0…1 to ±1. Modulation to an audio range.",
  "math1-absmax1": "Absolute value of the input, sample by sample. Instantaneous, with no hold — for a decaying readout use Peak Hold.",

  // ---- Conversion
  "conv-cents2ratio": "Cents to a frequency multiplier: 1200 cents doubles the frequency.",
  "conv-ratio2cents": "Frequency multiplier to cents, the inverse of Cents → Ratio.",
  "conv-bpm2hz": "Beats per minute to Hz, for driving an LFO from a tempo.",
  "conv-hz2bpm": "Hz to beats per minute.",

  // ---- Routing / mixing
  "route-split": "Copies one input to two outputs. The two are identical, so the result is mono in the stereo field.",
  "route-merge": "Sums two inputs to one. Summing correlated channels can add up to 6 dB.",
  "route-swap": "Exchanges the two channels.",
  "route-select2": "Passes input a or b according to the selector, truncated to an integer. Switching is instant, so it clicks on a live signal.",
  "route-select3": "Passes a, b or c according to the selector, truncated to an integer. Switching is instant.",
  "route-mix3": "Sums three inputs with no attenuation — three full-scale signals will clip.",
  "route-mix4": "Sums four inputs with no attenuation.",
  "route-mix5": "Sums five inputs with no attenuation.",
  "route-mix6": "Sums six inputs with no attenuation.",
  "route-mix8": "Sums eight inputs with no attenuation. Use the 8-channel mixer instead when you want levels.",
  "route-dup4": "Copies one input to four identical outputs.",
  "route-cross3": "Crossfades along three inputs with one 0…2 position: 0 is a, 1 is b, 2 is c.",
  "route-mid-side": "L/R to mid/side. Mid is the sum halved, side the difference halved.",
  "route-side-mid": "Mid/side back to L/R. Pair with L/R → Mid/Side to process the sides on their own.",
  "util-gate": "Passes the input while the control is above 0.5, silence below. The cut is instant and will click.",
  "util-recip-gate": "Multiplies the input by the CV — a VCA with no built-in smoothing.",
  "util-attenuvert": "Multiplies the input by the CV, which may be negative and then inverts as it attenuates.",
  "util-sum-gain": "Sums two inputs and applies one gain to the result.",
  "util-invert": "Flips the sign — a 180° phase inversion.",
  "util-dup3": "Copies one input to three identical outputs.",
  "util-phase-invert-r": "Passes left unchanged and inverts right. Collapsing this to mono cancels the centre.",
  "util-stereo-sum": "Sums the two channels to mono and applies a gain.",
  "util-gain2": "Applies one gain to both channels, keeping them separate.",
  "util-mute": "Passes the input while the gate is above 0.5. The cut is instant and will click.",

  // ---- Waveshapers
  "dist-clip": "Hard clip at ±1 after the drive. Abrupt corners, so it aliases — the anti-aliased Hard Clip (AA) is the cleaner choice.",
  "dist-cubic": "Cubic soft clip, output limited to ±0.66. Adds odd harmonics gently before it saturates.",
  "dist-bitcrush": "Truncates to the given number of bits. Truncation biases the signal negative — Bitcrusher (round) does not.",
  "ws-softsign": "x ÷ (1 + |x|) after the drive: a smooth saturator that approaches ±1 but never reaches it.",
  "ws-sigmoid": "Logistic curve scaled to ±1. Symmetric, so it adds odd harmonics only.",
  "ws-foldback": "Folds the signal back on itself instead of clipping it, adding harmonics that rise with the drive rather than plateau.",
  "ws-octave-up": "2|x| − 1: full-wave rectification remapped to ±1, which sounds an octave above the input.",
  "ws-asym-clip": "Clips at +1 but −0.5, so the asymmetry adds even harmonics as well as odd.",
  "ws-poly-soft": "Cubic soft clip, 1.5y − 0.5y³, on an input pre-clamped to ±1. The classic analogue-style curve.",
  "ws-rectifier": "Full-wave rectifier, |x|. Sounds an octave up and adds a DC offset — block DC afterwards.",
  "ws-halfrect": "Half-wave rectifier: keeps the positive half, zeroes the rest. Adds a DC offset.",
  "ws-rect-shape": "Blends the input with its rectified copy, so you can dial in the octave-up harmonic.",
  "ws-cheb2": "Chebyshev polynomial of order 2: a sine at full level comes out as its 2nd harmonic. Input clamped to ±1.",
  "ws-cheb3": "Chebyshev order 3 — a full-level sine becomes its 3rd harmonic. Input clamped to ±1.",
  "ws-cheb4": "Chebyshev order 4 — a full-level sine becomes its 4th harmonic. Input clamped to ±1.",
  "ws-cheb5": "Chebyshev order 5 — a full-level sine becomes its 5th harmonic. Input clamped to ±1.",
  "ws-cheb6": "Chebyshev order 6 — a full-level sine becomes its 6th harmonic. Input clamped to ±1.",
  "ws-cheb7": "Chebyshev order 7 — a full-level sine becomes its 7th harmonic. Input clamped to ±1.",
  "ws-cheb8": "Chebyshev order 8 — a full-level sine becomes its 8th harmonic. Input clamped to ±1.",

  // ---- Spatial
  "sp-spat-blur": "Widens or narrows the stereo image by adding the channel difference back to each side. Above ~1 the image collapses when summed to mono.",
  "sp-constant-power": "Balance between the two channels on a √ law, so the total power stays constant.",
  "sp-ms-balance": "Tilts the mix between mid and side content: 0 is mono, 1 is sides only.",
  "sp-pan3": "Pans one input across three outputs — left, centre, right — with the centre fading in between.",

  // ---- Modulation / mixing / sequencing
  "cv-bias": "Scales the input then adds a bias — the usual way to fit an LFO to a parameter range.",
  "cv-mix-4": "Four CVs, each with its own bipolar amount, summed to one output.",
  "mod-matrix-2x2": "Routes two sources to two destinations with an independent amount per cell.",
  "mix-8-mono": "Eight inputs with per-channel levels, summed to mono.",
  "clock-div": "Passes every Nth rising edge of the clock. Divide 1 passes them all.",
  "euclid": "Euclidean rhythm: spreads the pulses as evenly as possible across the steps, with a rotation offset. Steps and pulses are clamped to 16.",

  // ---- Signal
  "no-velvet": "Sparse random impulses of alternating sign at the given average density — the standard building block for a diffuse reverb tail.",
  "si-lag-ud": "Slew limiter with independent up and down rates, in seconds — asymmetric portamento, or an envelope follower.",
};

for (const b of blocks) {
  if (!b.tooltip && TIPS[b.id]) b.tooltip = TIPS[b.id];
}

export default blocks;
