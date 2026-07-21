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
const B = (id, title, category, args, body) => blocks.push({ id, title, category, args, body });

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
  ["pulsetrainpos", "Pulse Train"],
  ["sawtoothpos", "Saw (0..1)"],
]) {
  B(`os-${fn}`, title, "Oscillators", [FREQ(), GAIN()], `os.${fn}(freq) * gain`);
}
B("os-pulsetrain", "Pulse Train (duty)", "Oscillators",
  [FREQ(), ctl("duty", "duty", 0.5, 0, 1), GAIN()], "os.pulsetrain(freq, duty) * gain");
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
B("ve-moog", "Moog VCF", "Virtual Analog", [sig("x", "in"), CUT(), ctl("res", "res", 0.5, 0, 1)], "x : ve.moog_vcf(res, cutoff)");
B("ve-moogladder", "Moog Ladder", "Virtual Analog", [sig("x", "in"), CUT(), ctl("res", "res", 0.5, 0, 1)], "x : ve.moogLadder(cutoff, res)");
B("ve-korg35lpf", "Korg 35 LP", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.korg35LPF(cutoff, q)");
B("ve-korg35hpf", "Korg 35 HP", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.korg35HPF(cutoff, q)");
B("ve-diodeladder", "Diode Ladder", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.diodeLadder(cutoff, q)");
B("ve-oberheim-bpf", "Oberheim BP", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.oberheimBPF(cutoff, q)");
B("ve-oberheim-lpf", "Oberheim LP", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.oberheimLPF(cutoff, q)");
B("ve-sallenkey-lpf", "Sallen-Key LP", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.sallenKey2ndOrderLPF(cutoff, q)");
B("ve-sallenkey-hpf", "Sallen-Key HP", "Virtual Analog", [sig("x", "in"), CUT(), ctl("q", "q", 2, 0.5, 20)], "x : ve.sallenKey2ndOrderHPF(cutoff, q)");

// ------------------------------------------------------------------ Delays
B("de-delay", "Delay (samples)", "Delay", [sig("x", "in"), ctl("n", "samples", 4800, 0, 96000)], "x : de.delay(96000, int(n))");
B("de-fdelay", "Delay (ms)", "Delay", [sig("x", "in"), ctl("ms", "time", 250, 0, 2000, "ms")], "x : de.fdelay(96000, ma.SR*ms/1000)");
B("de-echo", "Echo", "Delay", [sig("x", "in"), ctl("ms", "time", 250, 1, 2000, "ms"), ctl("fb", "feedback", 0.4, 0, 0.95)],
  "x : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb)))");
B("de-sdelay", "Smooth Delay", "Delay", [sig("x", "in"), ctl("ms", "time", 250, 0, 2000, "ms")], "x : de.sdelay(96000, 1024, ma.SR*ms/1000)");
B("de-pingpong", "Ping-Pong", "Delay",
  [sig("l", "L"), sig("r", "R"), ctl("ms", "time", 300, 1, 2000, "ms"), ctl("fb", "feedback", 0.4, 0, 0.9)],
  "(l, r) : (\\(fl, fr).(l + de.fdelay(192000, ma.SR*ms/1000, fr)*fb, r + de.fdelay(192000, ma.SR*ms/1000, fl)*fb)) ~ (_, _)");

// ------------------------------------------------------------------ Reverb
B("re-mono-freeverb", "Freeverb (mono)", "Reverb", [sig("x", "in"), ctl("room", "room", 0.6, 0, 1), ctl("damp", "damp", 0.5, 0, 1)], "x : re.mono_freeverb(room, damp, 0.5, 1)");
B("re-stereo-freeverb", "Freeverb (stereo)", "Reverb", [sig("l", "L"), sig("r", "R"), ctl("room", "room", 0.6, 0, 1), ctl("damp", "damp", 0.5, 0, 1)], "l, r : re.stereo_freeverb(room, room, damp, 1)");
B("re-jcrev", "JC Reverb", "Reverb", [sig("x", "in")], "x : re.jcrev");
B("re-satrev", "Sat Reverb", "Reverb", [sig("x", "in")], "x : re.satrev");
B("re-mono-fdn", "FDN Reverb", "Reverb", [sig("x", "in"), ctl("t60", "t60", 3, 0.1, 20, "s")], "x <: re.fdnrev0(2048, (778, 1601, 2451, 3307), (2, 3), t60, t60, 8000, 44100) :> _");

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
B("mod-flanger", "Flanger", "Modulation", [sig("x", "in"), ctl("rate", "rate", 0.5, 0.01, 10, "Hz"), ctl("depth", "depth", 0.5, 0, 1), ctl("fb", "feedback", 0.5, 0, 0.95)],
  "x : (+ ~ (@(ma.SR*(0.001 + 0.004*depth*(0.5+0.5*os.osc(rate)))) : *(fb)))");
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
B("an-zerocross", "Zero Crossing", "Analysis", [sig("x", "in")], "x : an.zcr");

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
B("ef-mixLinearClamp", "Dry/Wet Clamp", "Effects", [sig("d", "dry"), sig("w", "wet"), ctl("mix", "mix", 0.5, 0, 1)], "ef.mixLinearClamp(64, mix, d, w)");
B("ef-speakerbp", "Speaker Sim", "Effects", [sig("x", "in")], "x : ef.speakerbp(130, 5000)");
B("fx-autowah", "Auto Wah", "Effects", [sig("x", "in"), ctl("sens", "sens", 0.5, 0, 1)], "x : (\\(s).(s : fi.resonlp(200 + 4000*sens*(s : abs : an.amp_follower(0.02)), 8, 1.0)))");
B("fx-wah", "Wah (LFO)", "Effects", [sig("x", "in"), ctl("rate", "rate", 1.5, 0.05, 8, "Hz"), ctl("depth", "depth", 0.7, 0, 1)], "x : fi.resonlp(400 + 2500*depth*(0.5+0.5*os.osc(rate)), 8, 1.0)");
B("fx-phaser", "Phaser", "Effects", [sig("x", "in"), ctl("rate", "rate", 0.5, 0.01, 8, "Hz"), ctl("depth", "depth", 0.7, 0, 1)],
  "x : seq(i, 4, fi.allpassnn(1, 0.5 + 0.45*depth*(0.5+0.5*os.osc(rate))))");
B("fx-stereo-echo", "Stereo Echo", "Effects",
  [sig("l", "L"), sig("r", "R"), ctl("ms", "time", 300, 1, 2000, "ms"), ctl("fb", "feedback", 0.4, 0, 0.9)],
  "l : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb))), r : (+ ~ (de.fdelay(192000, ma.SR*ms/1000) : *(fb)))");

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
  [sig("x", "in"), ctl("ratio", "ratio", 2, 1, 20), ctl("thresh", "thresh", -40, -90, 0, "dB"), ctl("att", "attack", 0.01, 0.001, 1, "s"), ctl("hold", "hold", 0.05, 0, 1, "s"), ctl("rel", "release", 0.1, 0.001, 2, "s"), ctl("knee", "knee", 3, 0, 20, "dB")],
  "x : co.expander_mono(ratio, thresh, att, hold, rel, knee)");

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
  ["sinh", "Sinh", "sinh(x)"], ["cosh", "Cosh", "cosh(x)"], ["log10", "Log10", "log10(abs(x) + 1e-9)"],
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
B("sy-sawtrombone", "Saw Trombone", "Synths", [sig("gate", "gate"), FREQ()], "sy.sawTrombone(freq) * gate");
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
// ------------------------------------------------------------------ Graphic EQ bands
for (const f of [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]) {
  const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
  B(`eq-band-${f}`, `EQ ${label}`, "EQ", [sig("x", "in"), ctl("gain", "gain", 0, -18, 18, "dB")], `x : fi.peak_eq(gain, ${f}, ${Math.round(f * 0.7)})`);
}
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
B("fi-crossover", "Crossover 2-band", "Filters", [sig("x", "in"), CUT()], "x : fi.lowpassLR4(cutoff), x : fi.highpassLR4(cutoff)");
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
B("ws-fuzz", "Fuzz", "Distortion", [sig("x", "in"), ctl("drive", "drive", 20, 1, 100)], "ma.signum(x) * (1 - exp(-abs(x*drive)))");
B("ws-rect-shape", "Rectifier Shape", "Distortion", [sig("x", "in"), ctl("mix", "mix", 0.5, 0, 1)], "x*(1-mix) + abs(x)*mix");
B("ws-sine-stage", "Sine Shaper", "Distortion", [sig("x", "in"), ctl("drive", "drive", 1, 0.1, 4)], "sin(x*drive*ma.PI*0.5)");
B("ws-crossover", "Crossover Dist", "Distortion", [sig("x", "in"), ctl("dead", "deadzone", 0.1, 0, 0.5)], "(abs(x) > dead) * (x - ma.signum(x)*dead)");
B("ws-exp-shape", "Exp Shaper", "Distortion", [sig("x", "in"), ctl("amt", "amount", 2, 0.1, 10)], "ma.signum(x) * (1 - exp(-abs(x)*amt))");
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
B("pm-marimba", "Marimba", "Synths", [sig("trig", "trig"), FREQ(), ctl("pos", "strike pos", 0.3, 0, 1), GAIN(0.8)], "pm.marimbaModel(freq, pos) * gain : *(trig : en.ar(0.001, 1))");
B("sy-popperc", "Pop Perc", "Synths", [sig("gate", "gate"), FREQ()], "sy.popFilterPerc(freq, gate)");
B("sy-additive-drum", "Additive Drum", "Synths", [sig("gate", "gate"), FREQ(), ctl("ratio", "ratio", 1.5, 0.5, 5), GAIN(0.7)], "sy.additiveDrum(freq, (1, ratio, ratio*2), 0.8, 0.001, 0.3, gate) * gain");

// ================================================================= BATCH 5
// ------------------------------------------------------------------ 1/3-octave graphic EQ bands
for (const f of [25, 40, 50, 80, 100, 160, 200, 315, 400, 630, 800, 1250, 1600, 2500, 3150, 5000, 6300, 10000, 12500, 20000]) {
  const label = f >= 1000 ? `${(f / 1000).toString().replace(/\.0$/, "")}k` : `${f}`;
  B(`eq-band-${f}`, `EQ ${label}`, "EQ", [sig("x", "in"), ctl("gain", "gain", 0, -18, 18, "dB")], `x : fi.peak_eq(gain, ${f}, ${Math.max(10, Math.round(f * 0.23))})`);
}

// ------------------------------------------------------------------ Filters (fixes + more)
B("fi-crossover2", "Crossover 2-band", "Filters", [sig("x", "in"), CUT()], "x <: fi.lowpassLR4(cutoff), fi.highpassLR4(cutoff)");
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

export default blocks;
