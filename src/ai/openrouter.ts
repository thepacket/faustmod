/**
 * Minimal OpenRouter client for generating FaustMod DSP from a prompt. Bring-your-own
 * key: the user's OpenRouter key + chosen model are read from localStorage (set in
 * File → Settings…), so FaustMod itself never pays for tokens. The coding conventions
 * live in the system prompt — no catalog/patch context is sent.
 */

export const OPENROUTER_KEY = "faustmod.openrouterKey";
export const OPENROUTER_MODEL = "faustmod.openrouterModel";
export const OPENROUTER_SYSTEM = "faustmod.systemPrompt";
export const OPENROUTER_PD_SYSTEM = "faustmod.pdSystemPrompt";
export const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

/** Default system prompt for the Faust Make button. Editable in File → Settings…. */
export const DEFAULT_SYSTEM_PROMPT = `You write Faust DSP for FaustMod, a modular audio patcher. Output ONLY Faust source — no prose, no markdown fences.

Rules:
- Start with import("stdfaust.lib"); and define exactly one "process".
- The arguments of process(...) are the node's AUDIO INPUT connectors, in order — give them meaningful names (they become the port labels), e.g. process(in) or process(l, r).
- Declare a CONTROL INPUT with a UI primitive: hslider/vslider/nentry("name", default, min, max, step) or button/checkbox("name"). In FaustMod these become INPUT PORTS (not on-screen knobs); the default/min/max define the port. Never assume a GUI is shown.
- The number of process outputs is the AUDIO OUTPUT connectors (1 = mono "out", 2 = stereo).
- Must be self-contained and real-time safe for an AudioWorklet: NO soundfile, NO ffunction/foreign functions, NO file or OS access. Use only stdfaust.lib.
- Keep it stable (bounded feedback, no NaN/blow-ups).`;

/** Default system prompt for the Pd Make button. Editable in File → Settings…. */
export const DEFAULT_PD_SYSTEM_PROMPT = `You write Pure Data (Pd) patches for FaustMod, run in the browser by WebPd. Output ONLY the raw .pd file text — no prose, no markdown fences.

Rules:
- Use ONLY vanilla Pd audio objects that WebPd supports, e.g.: osc~ phasor~ +~ -~ *~ /~ min~ max~ pow~ abs~ cos~ sqrt~ exp~ log~ wrap~ mtof~ ftom~ lop~ hip~ bp~ vcf~ noise~ delread~ delread4~ delwrite~ clip~ line~ vline~ sig~ snapshot~ samphold~ expr~ tabread4~ tabosc4~ send~ receive~ throw~ catch~. NO externals (no ELSE/cyclone), NO GUI objects, NO FFT/spectral objects, NO message-domain scheduling (metro, delay, trigger are control-rate and won't work for audio).
- Audio I/O uses adc~ (inputs) and dac~ (outputs), NOT inlet~/outlet~. Each input PORT is one adc~ channel: [adc~ 1] = port 1, [adc~ 2] = port 2, and so on. Parameters are just extra input channels driven at audio rate. Output is [dac~ 1] for mono or [dac~] for stereo (max 2 channels).
- Declare metadata as Pd comments (#X text):
    @name <Title>
    @desc <one short line>
    @in <one name per input channel, space-separated, in channel order>
    @out <one name per output channel>
    @param <inputName> <default> <min> <max>   (one line per control input)
- .pd format: first line is "#N canvas 0 0 <W> <H> 12;". Object: "#X obj <x> <y> <name> <args>;". Connection: "#X connect <srcIndex> <outlet> <dstIndex> <inlet>;". Comment: "#X text <x> <y> <content>;". Object indices in #X connect count EVERY object in file order INCLUDING comments. CRITICAL: write ALL #X obj lines first, THEN all #X connect lines, THEN all #X text comment lines at the very end — so comments never shift the object indices used by connections.
- Compose something musically useful from multiple objects (a voice, an effect, a filter with modulation), not a single-object wrapper. Keep it stable (bounded feedback). Mono unless stereo is requested.

Example (audio through a one-pole lowpass with a cutoff parameter):
#N canvas 0 0 460 320 12;
#X obj 40 60 adc~ 1;
#X obj 160 60 adc~ 2;
#X obj 40 130 lop~;
#X obj 40 200 dac~ 1;
#X connect 0 0 2 0;
#X connect 1 0 2 1;
#X connect 2 0 3 0;
#X text 40 20 @name Lowpass;
#X text 40 240 @desc One-pole lowpass filter.;
#X text 40 260 @in audio cutoff;
#X text 240 260 @out out;
#X text 40 280 @param cutoff 1000 20 12000;`;

/** The active Faust system prompt: the user's edited override (Settings) or the default. */
export function systemPrompt(): string {
  return localStorage.getItem(OPENROUTER_SYSTEM)?.trim() || DEFAULT_SYSTEM_PROMPT;
}

/** The active Pd system prompt: the user's edited override (Settings) or the default. */
export function pdSystemPrompt(): string {
  return localStorage.getItem(OPENROUTER_PD_SYSTEM)?.trim() || DEFAULT_PD_SYSTEM_PROMPT;
}

/**
 * Fetch the full list of model IDs available on OpenRouter (public endpoint, no key
 * required). Returns them sorted; throws on network/HTTP error so the caller can fall
 * back to a small built-in list.
 */
export async function fetchModels(): Promise<string[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const data = await res.json();
  const ids: string[] = (data?.data ?? [])
    .map((m: { id?: string }) => m?.id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
  return ids.sort((a, b) => a.localeCompare(b));
}

function stripFences(s: string): string {
  const m = s.match(/```(?:faust|dsp|cpp|puredata|pd)?\s*\n?([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/** POST a system+user turn to the model and return the fenced-stripped content. */
async function callModel(system: string, user: string, language: string): Promise<string> {
  const key = localStorage.getItem(OPENROUTER_KEY)?.trim();
  if (!key) throw new Error("Set your OpenRouter API key in File → Settings…");
  const model = localStorage.getItem(OPENROUTER_MODEL)?.trim() || DEFAULT_MODEL;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": location.origin,
      "X-Title": "FaustMod",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message ?? "";
    } catch {
      detail = (await res.text().catch(() => "")).slice(0, 160);
    }
    throw new Error(`OpenRouter ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const code = stripFences(content);
  if (!code) throw new Error(`The model returned no ${language}.`);
  return code;
}

/**
 * Ask the configured model to write/modify a Faust DSP program. `currentCode` (if any)
 * is sent so the model can iterate on it. Throws on missing key or API error.
 */
export async function generateDsp(prompt: string, currentCode?: string): Promise<string> {
  const user =
    currentCode && currentCode.trim()
      ? `Current code:\n\n${currentCode}\n\nRequest: ${prompt}\n\nReturn the complete updated Faust program.`
      : prompt;
  return callModel(systemPrompt(), user, "code");
}

/**
 * Ask the configured model to write a Pure Data (.pd) module for FaustMod. `currentCode`
 * (if any) is sent so the model can iterate on it. Throws on missing key or API error.
 */
export async function generatePd(prompt: string, currentCode?: string): Promise<string> {
  const user =
    currentCode && currentCode.trim()
      ? `Current patch:\n\n${currentCode}\n\nRequest: ${prompt}\n\nReturn the complete updated .pd file.`
      : prompt;
  return callModel(pdSystemPrompt(), user, "patch");
}
