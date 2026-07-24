/**
 * Minimal OpenRouter client for generating FaustMod DSP from a prompt. Bring-your-own
 * key: the user's OpenRouter key + chosen model are read from localStorage (set in
 * File → Settings…), so FaustMod itself never pays for tokens. The coding conventions
 * live in the system prompt — no catalog/patch context is sent.
 */

export const OPENROUTER_KEY = "faustmod.openrouterKey";
export const OPENROUTER_MODEL = "faustmod.openrouterModel";
export const OPENROUTER_SYSTEM = "faustmod.systemPrompt";
export const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

/** Default system prompt for the Faust Make button. Editable in File → Settings…. */
export const DEFAULT_SYSTEM_PROMPT = `You write Faust DSP for FaustMod, a modular audio patcher.

Think through the design first if it helps, then give the COMPLETE program in a single \`\`\`faust code block. FaustMod extracts that block and compiles it, so it must be the whole, self-contained program — do not split it across multiple blocks or leave anything for the user to fill in.

Rules:
- Start with import("stdfaust.lib"); and define exactly one "process".
- The arguments of process(...) are the node's AUDIO INPUT connectors, in order — give them meaningful names (they become the port labels), e.g. process(in) or process(l, r).
- Declare a CONTROL INPUT with a UI primitive: hslider/vslider/nentry("name", default, min, max, step) or button/checkbox("name"). In FaustMod these become INPUT PORTS (not on-screen knobs); the default/min/max define the port. Never assume a GUI is shown.
- The number of process outputs is the AUDIO OUTPUT connectors (1 = mono "out", 2 = stereo).
- Must be self-contained and real-time safe for an AudioWorklet: NO soundfile, NO ffunction/foreign functions, NO file or OS access. Use only stdfaust.lib.
- Keep it stable (bounded feedback, no NaN/blow-ups).`;

/** The active Faust system prompt: the user's edited override (Settings) or the default. */
export function systemPrompt(): string {
  return localStorage.getItem(OPENROUTER_SYSTEM)?.trim() || DEFAULT_SYSTEM_PROMPT;
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

/**
 * Pull the code out of the model's reply. The model may reason first and then give the
 * program in a fenced block, so take the LAST fenced block (the final answer). If there
 * are no fences, assume the whole reply is the code.
 */
function stripFences(s: string): string {
  const fence = /```(?:faust|dsp|cpp)?[ \t]*\n?([\s\S]*?)```/gi;
  let last: string | null = null;
  for (const m of s.matchAll(fence)) last = m[1];
  return (last ?? s).trim();
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
      // Generous cap: DSP with reasoning first can run long; a small default cap would
      // silently truncate the program (→ it won't compile).
      max_tokens: 8000,
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
