/**
 * Minimal OpenRouter client for generating FaustMod DSP and patches from a prompt.
 * Bring-your-own key: the user's OpenRouter key + chosen model are read from localStorage
 * (set in File → Settings…), so FaustMod itself never pays for tokens. For DSP the coding
 * conventions live in the system prompt and no catalog is sent; for whole patches the
 * system prompt IS the catalog (see buildAiBrief), since the model can only wire together
 * blocks it knows exist.
 */
import { buildAiBrief } from "../patch/aiBrief";

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
 *
 * A reply that ran into the output limit ends INSIDE a block, with no closing fence — that
 * partial text is still the answer, so prefer an unterminated trailing fence over the last
 * complete one. Without this a truncated reply falls back to the whole message (prose and
 * all) or, worse, silently returns an earlier block the model was only quoting.
 */
function stripFences(s: string): string {
  const fence = /```(?:faust|dsp|cpp|json)?[ \t]*\n?([\s\S]*?)```/gi;
  let last: string | null = null;
  let end = 0;
  for (const m of s.matchAll(fence)) {
    last = m[1];
    end = (m.index ?? 0) + m[0].length;
  }
  const tail = s.slice(end);
  const open = /```(?:faust|dsp|cpp|json)?[ \t]*\n?/i.exec(tail);
  if (open) return tail.slice(open.index + open[0].length).trim();
  return (last ?? s).trim();
}

type Turn = { role: "system" | "user" | "assistant"; content: string };

/** Output cap that every model on OpenRouter accepts; used when a larger ask is refused. */
const FALLBACK_MAX_TOKENS = 8000;

/** POST one completion. `truncated` means the model ran into the output cap mid-answer. */
async function post(messages: Turn[], maxTokens: number): Promise<{ content: string; truncated: boolean }> {
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
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json())?.error?.message ?? "";
    } catch {
      detail = (await res.text().catch(() => "")).slice(0, 160);
    }
    // Asking for more output than the chosen model can produce is a 400 on some providers
    // (others silently clamp). Drop to a cap every model supports rather than failing.
    if (res.status === 400 && maxTokens > FALLBACK_MAX_TOKENS && /max.?(completion.?)?tokens/i.test(detail)) {
      return post(messages, FALLBACK_MAX_TOKENS);
    }
    throw new Error(`OpenRouter ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  const choice = (await res.json())?.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    // OpenRouter normalises to finish_reason; native_finish_reason is the provider's own.
    truncated: choice?.finish_reason === "length" || choice?.native_finish_reason === "length",
  };
}

/**
 * Send a system+user turn and return the fenced-stripped content.
 *
 * If the reply hit the output cap it is resumed ONCE: the partial answer is handed back as
 * an assistant turn and the model continues from where it stopped. Reasoning tokens count
 * against the same cap, so a long think followed by a big document overruns it easily —
 * without this the user just gets an unparseable half-document.
 */
async function callModel(
  system: string,
  user: string,
  language: string,
  maxTokens = 8000,
): Promise<string> {
  const messages: Turn[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let { content, truncated } = await post(messages, maxTokens);

  if (truncated && content) {
    const partial = content;
    const more = await post(
      [
        ...messages,
        { role: "assistant", content: partial },
        {
          role: "user",
          content:
            "Your previous message stopped at the output limit, mid-answer. Continue from " +
            "EXACTLY where it stopped: output only the remaining characters, with no " +
            "repetition, no explanation, and no new code fence.",
        },
      ],
      maxTokens,
    );
    content = partial + more.content;
    truncated = more.truncated;
  }

  const code = stripFences(content);
  if (!code) throw new Error(`The model returned no ${language}.`);
  if (truncated) {
    throw new Error(
      `The model ran out of output room and the ${language} is incomplete. Ask for something ` +
        `smaller, or pick a model with a larger output limit in File → Settings….`,
    );
  }
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
 * Output rules appended to the catalog brief for the Patches → Gen button. The brief
 * itself documents the format and every available block; this says what to hand back.
 */
const PATCH_RULES = `
== Your task ==
Answer with ONE complete .faustmod patch in a single \`\`\`json code block. FaustMod takes
that block and opens it as a new patch, so it must be the whole document and valid JSON,
with nothing left for the user to fill in.

Getting cut off mid-document is the most common failure here, so spend your output budget
on the patch itself: keep any thinking to a couple of sentences before the block, write the
JSON COMPACTLY (no indentation, no blank lines, short node ids like "o1"/"f1"), and never
add comments or repeat the document. FaustMod reformats it for display afterwards.

- Include "format": "faustmod-patch", "version": 1, and a short descriptive "name".
- Use ONLY componentIds listed above, or a block you define yourself in "customBlocks".
- Node ids must be unique. Every connection must name existing node ids and real ports:
  ports are positional, in-0..in-(N-1) and out-0..out-(M-1) for that component's counts.
- The patch must be AUDIBLE: something has to reach the "output" node's in-0 and in-1.
- To set a FIXED value on an input, put it in that node's "params" — e.g.
  "params":{"in-1":0.8} — and do NOT wire a "constant" node in. Constants are for values
  the user should see and share between several inputs; a wall of them for ordinary
  settings just clutters the patch. Values must stay within the port's declared min/max.
- Wire something in only when the value has to CHANGE: an LFO or envelope to modulate it,
  or a knob/slider/xypad when the user should be able to play with it while it runs.
- Lay it out left-to-right, sources on the left and "output" on the right, roughly 200px
  between columns, and don't overlap nodes.`;

/**
 * Ask the configured model for a whole patch. The system prompt is the generated catalog
 * brief (every block with its ports, plus the file format) so the model wires real ids.
 * `currentJson` (if any) is sent so Make can iterate on what's already in the editor.
 */
export async function generatePatch(prompt: string, currentJson?: string): Promise<string> {
  const user =
    currentJson && currentJson.trim()
      ? // Send the editor's copy compacted: it is pretty-printed for reading, and those
        // indents are pure input tokens on every iteration.
        `Current patch:\n\n${compact(currentJson)}\n\nRequest: ${prompt}\n\nReturn the complete updated patch.`
      : prompt;
  // A patch document runs much longer than one Faust program, and the model reasons before
  // it — 8k (the DSP cap) is where these were being cut off.
  const raw = await callModel(`${buildAiBrief()}\n${PATCH_RULES}`, user, "patch", 32000);
  // The model is asked for compact JSON to save output tokens; pretty-print it so the
  // editor shows something readable. Left as-is when it doesn't parse, so the editor can
  // report the real problem and offer Fix.
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Strip formatting whitespace from a patch document; returns the input if it isn't JSON. */
function compact(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
}
