/** Client-side persistence for the user's OpenRouter credentials + model choice. */
const KEY_API = "faustmod.openrouter.key";
const KEY_MODEL = "faustmod.openrouter.model";

export const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

export const Settings = {
  getApiKey(): string {
    return localStorage.getItem(KEY_API) ?? "";
  },
  setApiKey(key: string) {
    localStorage.setItem(KEY_API, key.trim());
  },
  getModel(): string {
    return localStorage.getItem(KEY_MODEL) || DEFAULT_MODEL;
  },
  setModel(model: string) {
    localStorage.setItem(KEY_MODEL, model.trim() || DEFAULT_MODEL);
  },
};
