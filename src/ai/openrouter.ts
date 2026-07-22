/**
 * Minimal OpenRouter client for generating FaustMod DSP from a prompt. Bring-your-own
 * key: the user's OpenRouter key + chosen model are read from localStorage (set in
 * File → Settings…), so FaustMod itself never pays for tokens. The coding conventions
 * live in the system prompt — no catalog/patch context is sent.
 */

export const OPENROUTER_KEY = "faustmod.openrouterKey";
export const OPENROUTER_MODEL = "faustmod.openrouterModel";
export const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

const SYSTEM_PROMPT = `You write Faust DSP for FaustMod, a modular audio patcher. Output ONLY Faust source — no prose, no markdown fences.

Rules:
- Start with import("stdfaust.lib"); and define exactly one "process".
- The arguments of process(...) are the node's AUDIO INPUT connectors, in order — give them meaningful names (they become the port labels), e.g. process(in) or process(l, r).
- Declare a CONTROL INPUT with a UI primitive: hslider/vslider/nentry("name", default, min, max, step) or button/checkbox("name"). In FaustMod these become INPUT PORTS (not on-screen knobs); the default/min/max define the port. Never assume a GUI is shown.
- The number of process outputs is the AUDIO OUTPUT connectors (1 = mono "out", 2 = stereo).
- Must be self-contained and real-time safe for an AudioWorklet: NO soundfile, NO ffunction/foreign functions, NO file or OS access. Use only stdfaust.lib.
- Keep it stable (bounded feedback, no NaN/blow-ups).`;

function stripFences(s: string): string {
  const m = s.match(/```(?:faust|dsp|cpp)?\s*\n?([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

/**
 * Ask the configured model to write/modify a Faust DSP program. `currentCode` (if any)
 * is sent so the model can iterate on it. Returns the code; throws with a message on
 * missing key or API error.
 */
export async function generateDsp(prompt: string, currentCode?: string): Promise<string> {
  const key = localStorage.getItem(OPENROUTER_KEY)?.trim();
  if (!key) throw new Error("Set your OpenRouter API key in File → Settings…");
  const model = localStorage.getItem(OPENROUTER_MODEL)?.trim() || DEFAULT_MODEL;

  const userContent =
    currentCode && currentCode.trim()
      ? `Current code:\n\n${currentCode}\n\nRequest: ${prompt}\n\nReturn the complete updated Faust program.`
      : prompt;

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
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
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
  if (!code) throw new Error("The model returned no code.");
  return code;
}
