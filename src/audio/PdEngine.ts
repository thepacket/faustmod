import * as WebPd from "webpd";

/**
 * Thin wrapper over WebPd's browser API. Everything runs client-side: `.pd` → JS is
 * compiled in the browser (no Emscripten), then run inside WebPd's AudioWorklet
 * processor (a stereo in/out node registered from an inlined blob — bundles cleanly).
 * This module is dynamically imported only when a Pd node is realized, so WebPd stays
 * out of the initial bundle.
 */

const initialized = new WeakSet<BaseAudioContext>();

/** Register WebPd's worklet processor for a context (once). */
async function ensureInit(ctx: AudioContext): Promise<void> {
  if (initialized.has(ctx)) return;
  await WebPd.Browser.initialize(ctx);
  initialized.add(ctx);
}

/** Compile a `.pd` string to runnable JavaScript, in-browser. Throws on failure. */
export async function compilePd(code: string): Promise<string> {
  const settings = WebPd.Browser.defaultSettingsForBuild(location.origin + "/");
  const result = await WebPd.Build.buildRunnable(code, "javascript", settings);
  return result as string;
}

/** Instantiate a running WebPd worklet node (stereo in / stereo out) for compiled JS. */
export async function runPd(ctx: AudioContext, jsCode: string): Promise<AudioWorkletNode> {
  await ensureInit(ctx);
  const settings = WebPd.Browser.defaultSettingsForRun("", () => {});
  const node = await WebPd.Browser.run(ctx, jsCode, settings);
  return node as unknown as AudioWorkletNode;
}
