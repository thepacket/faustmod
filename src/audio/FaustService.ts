import type {
  FaustCompiler,
  FaustMonoDspGenerator,
  FaustMonoAudioWorkletNode,
} from "@grame/faustwasm";

// IMPORTANT: faustwasm builds its AudioWorklet processor by stringifying its own
// classes with `.toString()` and evaluating them inside the worklet. That only works
// if faustwasm is used in its original, self-contained form. If Vite BUNDLES faustwasm
// into the app, the bundler renames/merges identifiers and the stringified classes end
// up referencing module-scope bindings that aren't in the worklet blob → the processor
// silently fails to register ("node name … is not defined in AudioWorkletGlobalScope"),
// but only in the production build (dev serves faustwasm un-bundled, so it works there).
//
// Fix: load faustwasm's pristine, self-contained ESM at RUNTIME via `?url` + dynamic
// import, so Vite emits the file verbatim as an asset and never bundles it.
import faustModuleUrl from "@grame/faustwasm/dist/esm/index.js?url";

// libfaust WASM compiler assets (only needed for future user-authored DSP, not the
// precompiled built-in factories). Passed explicitly so hashed filenames still resolve.
import faustJsUrl from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.js?url";
import faustDataUrl from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.data?url";
import faustWasmUrl from "@grame/faustwasm/libfaust-wasm/libfaust-wasm.wasm?url";

type FaustModuleExports = typeof import("@grame/faustwasm");

let faustModulePromise: Promise<FaustModuleExports> | null = null;
/** Load the pristine (un-bundled) faustwasm module served as a static asset. */
function getFaustModule(): Promise<FaustModuleExports> {
  if (!faustModulePromise) {
    faustModulePromise = import(/* @vite-ignore */ faustModuleUrl) as Promise<FaustModuleExports>;
  }
  return faustModulePromise;
}

export interface CompiledDsp {
  generator: FaustMonoDspGenerator;
  numInputs: number;
  numOutputs: number;
}

/** A precompiled DSP factory loaded from static assets (no libfaust involved). */
interface LoadedFactory {
  module: WebAssembly.Module;
  json: string;
}

/**
 * Owns the (singleton) Faust compiler and a cache of compiled DSP factories.
 * Compilation is independent of the AudioContext, so components can be compiled
 * for their I/O shape before the user starts audio.
 */
class FaustServiceImpl {
  private compilerPromise: Promise<FaustCompiler> | null = null;
  private cache = new Map<string, Promise<CompiledDsp>>();
  private factoryCache = new Map<string, Promise<LoadedFactory>>();
  /** Serializes AudioWorklet processor registration to avoid addModule races. */
  private nodeChain: Promise<unknown> = Promise.resolve();

  /**
   * Load a precompiled built-in block factory (public/factories/<id>.wasm + .json)
   * and instantiate an AudioWorklet from it — the libfaust compiler is never used.
   * Factories are cached by id; the WASM module is compiled with plain
   * WebAssembly.compile (~1 ms).
   *
   * The `createNode` step (which registers the AudioWorklet processor via
   * `audioWorklet.addModule`) is **serialized** across all calls: two concurrent
   * registrations of the same processor name can otherwise race so that one call
   * sees a cached-but-not-yet-registered processor and fails to construct the node
   * ("node name … is not defined in AudioWorkletGlobalScope"). Factory fetching
   * stays parallel; only instantiation is queued.
   */
  createFactoryNode(
    id: string,
    context: BaseAudioContext,
  ): Promise<FaustMonoAudioWorkletNode> {
    // Start the fetch immediately (parallel, cached). But read+update nodeChain
    // SYNCHRONOUSLY — with no await before it — so concurrent callers queue in
    // call order. (An await here would let two callers chain off the same value
    // and race on addModule registration.)
    const factoryPromise = this.loadFactory(id);
    const run = this.nodeChain.then(async () => {
      const [factory, fw] = await Promise.all([factoryPromise, getFaustModule()]);
      const generator = new fw.FaustMonoDspGenerator();
      const node = await generator.createNode(context, id, factory);
      if (!node) throw new Error(`Failed to instantiate factory node "${id}"`);
      return node as FaustMonoAudioWorkletNode;
    });
    // Keep the chain alive whether this instantiation succeeds or fails.
    this.nodeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private loadFactory(id: string): Promise<LoadedFactory> {
    let task = this.factoryCache.get(id);
    if (!task) {
      task = (async () => {
        const base = `${import.meta.env.BASE_URL}factories/${id}`;
        const [wasmRes, jsonRes] = await Promise.all([
          fetch(`${base}.wasm`),
          fetch(`${base}.json`),
        ]);
        if (!wasmRes.ok || !jsonRes.ok) {
          throw new Error(`Missing factory assets for "${id}"`);
        }
        const [bytes, json] = await Promise.all([wasmRes.arrayBuffer(), jsonRes.text()]);
        // Dev servers answer missing files with index.html (HTTP 200), so an .ok
        // response isn't enough — verify the WASM magic bytes for a clear error.
        const m = new Uint8Array(bytes, 0, 4);
        if (!(m[0] === 0x00 && m[1] === 0x61 && m[2] === 0x73 && m[3] === 0x6d)) {
          throw new Error(
            `factory "${id}" not found — run "npm run catalog" to generate public/factories`,
          );
        }
        const module = await WebAssembly.compile(bytes);
        return { module, json };
      })();
      this.factoryCache.set(id, task);
      task.catch(() => this.factoryCache.delete(id));
    }
    return task;
  }

  /** Pre-load the (large) libfaust WASM compiler without compiling any DSP, so the
   * first on-demand component compile is fast. Safe to call repeatedly. */
  warmup(): Promise<void> {
    return this.getCompiler().then(() => undefined);
  }

  private async getCompiler(): Promise<FaustCompiler> {
    if (!this.compilerPromise) {
      this.compilerPromise = (async () => {
        const fw = await getFaustModule();
        const module = await fw.instantiateFaustModuleFromFile(
          faustJsUrl,
          faustDataUrl,
          faustWasmUrl,
        );
        const libFaust = new fw.LibFaust(module);
        return new fw.FaustCompiler(libFaust);
      })();
    }
    return this.compilerPromise;
  }

  /** Compile Faust source, returning the factory + I/O counts. Cached by code. */
  compile(name: string, code: string): Promise<CompiledDsp> {
    const cached = this.cache.get(code);
    if (cached) return cached;

    const task = (async () => {
      const [compiler, fw] = await Promise.all([this.getCompiler(), getFaustModule()]);
      const generator = new fw.FaustMonoDspGenerator();
      const ok = await generator.compile(compiler, name, code, "-I libraries/");
      if (!ok) throw new Error(`Faust failed to compile component "${name}"`);
      const { numInputs, numOutputs } = ioCounts(generator.getJSON());
      return { generator, numInputs, numOutputs };
    })();

    this.cache.set(code, task);
    task.catch(() => this.cache.delete(code));
    return task;
  }

  /** Create a live AudioWorkletNode for a previously-compiled component. */
  async createNode(
    compiled: CompiledDsp,
    context: BaseAudioContext,
  ): Promise<FaustMonoAudioWorkletNode> {
    const node = await compiled.generator.createNode(context);
    if (!node) throw new Error("Failed to instantiate Faust AudioWorkletNode");
    return node as FaustMonoAudioWorkletNode;
  }
}

function ioCounts(json: string): { numInputs: number; numOutputs: number } {
  try {
    const meta = JSON.parse(json);
    return { numInputs: Number(meta.inputs ?? 0), numOutputs: Number(meta.outputs ?? 0) };
  } catch {
    return { numInputs: 0, numOutputs: 0 };
  }
}

export const FaustService = new FaustServiceImpl();
