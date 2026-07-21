import { Settings } from "./settings";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Minimal OpenRouter chat completion call. The API key lives in localStorage and
 * the browser calls OpenRouter directly (no backend). Returns the assistant text.
 */
export async function chat(messages: ChatMessage[]): Promise<string> {
  const apiKey = Settings.getApiKey();
  if (!apiKey) throw new Error("No OpenRouter API key set. Open Settings to add one.");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": location.origin,
      "X-Title": "FaustMod",
    },
    body: JSON.stringify({
      model: Settings.getModel(),
      messages,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter returned no message content");
  }
  return content;
}
