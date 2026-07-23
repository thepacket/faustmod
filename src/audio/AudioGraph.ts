import { AudioEngine } from "./AudioEngine";
import { FaustService } from "./FaustService";
import {
  FaustUnit,
  ModuleUnit,
  ConstantUnit,
  OutputUnit,
  InputUnit,
  TerminalUnit,
  PatchStubUnit,
} from "./units";
import {
  MeterUnit,
  ScopeUnit,
  SpectrumUnit,
  SequencerUnit,
  GateFreqUnit,
  Vec2Unit,
  SamplerUnit,
  GranularUnit,
  TunerUnit,
  NullUnit,
  Monitors,
} from "./monitors";
import type { AudioUnit, InputSpec } from "./types";
import { resolveComponent } from "../components/customBlocks";

interface Conn {
  src: string;
  srcIdx: number;
  dst: string;
  dstIdx: number;
}

/**
 * Holds the *desired* audio graph (nodes, connections, constant values) and, while
 * "live", mirrors it into real Web Audio nodes. The editor pushes changes here
 * regardless of playback state; start()/stop() realize or tear down the sound.
 */
class AudioGraphImpl {
  private desiredNodes = new Map<string, string>(); // nodeId -> componentId
  private conns = new Map<string, Conn>(); // connId -> Conn
  private values = new Map<string, number>(); // nodeId -> constant value
  // Per-node edited Faust source (module editor). When present, the node compiles
  // this source instead of loading its precompiled factory.
  private overrides = new Map<string, { code: string; inputs: InputSpec[] }>();

  private live = false;
  private units = new Map<string, Promise<AudioUnit | null>>();

  /** Optional hook so the UI can surface node-realization failures to the user. */
  onNodeError: ((message: string) => void) | null = null;
  /** When non-null, realization errors are collected here (during start()). */
  private collectErrors: string[] | null = null;

  get isLive() {
    return this.live;
  }

  // ---- desired-graph mutations (always valid) ----------------------------

  setNode(nodeId: string, componentId: string) {
    this.desiredNodes.set(nodeId, componentId);
    if (this.live) void this.realizeNode(nodeId);
  }

  /** Set (or replace) a node's edited Faust source. Re-realizes it if live. */
  setOverride(nodeId: string, code: string, inputs: InputSpec[]) {
    this.overrides.set(nodeId, { code, inputs });
    if (this.live) void this.reRealize(nodeId);
  }

  clearOverride(nodeId: string) {
    this.overrides.delete(nodeId);
  }

  /** Dispose and rebuild a single node's audio unit (e.g. after an edit). */
  private async reRealize(nodeId: string) {
    const u = this.units.get(nodeId);
    this.units.delete(nodeId);
    if (u) (await u)?.dispose();
    await this.realizeNode(nodeId);
    // Reconnect any live connections touching this node.
    for (const conn of this.conns.values()) {
      if (conn.src === nodeId || conn.dst === nodeId) await this.realizeConn(conn);
    }
  }

  async removeNode(nodeId: string) {
    this.desiredNodes.delete(nodeId);
    this.values.delete(nodeId);
    this.overrides.delete(nodeId);
    Monitors.delete(nodeId);
    for (const [id, c] of this.conns) {
      if (c.src === nodeId || c.dst === nodeId) this.conns.delete(id);
    }
    const u = this.units.get(nodeId);
    this.units.delete(nodeId);
    if (u) (await u)?.dispose();
  }

  setConn(connId: string, conn: Conn) {
    this.conns.set(connId, conn);
    if (this.live) void this.realizeConn(conn);
  }

  async removeConn(connId: string) {
    const conn = this.conns.get(connId);
    this.conns.delete(connId);
    if (this.live && conn) await this.unrealizeConn(conn);
  }

  /** Set the value emitted by a Constant node. */
  setValue(nodeId: string, value: number) {
    this.values.set(nodeId, value);
    if (this.live) void this.units.get(nodeId)?.then((u) => u?.setValue(value));
  }

  // ---- playback ----------------------------------------------------------

  /** Realize the whole graph. Returns messages for any nodes that failed to load. */
  async start(): Promise<string[]> {
    await AudioEngine.ensure();
    this.live = true;
    const errors: string[] = [];
    this.collectErrors = errors;
    try {
      for (const nodeId of this.desiredNodes.keys()) await this.realizeNode(nodeId);
      for (const conn of this.conns.values()) await this.realizeConn(conn);
    } finally {
      this.collectErrors = null;
    }
    return errors;
  }

  async stop() {
    this.live = false;
    const all = [...this.units.values()];
    this.units.clear();
    Monitors.clear();
    for (const p of all) (await p)?.dispose();
    await AudioEngine.suspend();
  }

  /** Discard the entire desired graph (used when loading a new patch). */
  async clear() {
    await this.stop();
    this.desiredNodes.clear();
    this.conns.clear();
    this.values.clear();
    this.overrides.clear();
  }

  // ---- realization -------------------------------------------------------

  private async realizeNode(nodeId: string): Promise<AudioUnit | null> {
    const existing = this.units.get(nodeId);
    if (existing) return existing;

    const componentId = this.desiredNodes.get(nodeId);
    const def = componentId ? resolveComponent(componentId) : undefined;
    if (!def) return null;

    const promise = (async (): Promise<AudioUnit | null> => {
      const ctx = AudioEngine.context!;
      try {
        // Edited module: compile the overridden source rather than the stock factory.
        const override = this.overrides.get(nodeId);
        if (override) {
          const compiled = await FaustService.compile(`${componentId}-edit`, override.code);
          const worklet = await FaustService.createNode(compiled, ctx);
          return new FaustUnit(ctx, worklet, override.inputs);
        }
        switch (def.kind) {
          case "output":
            return new OutputUnit(ctx, AudioEngine.masterNode!);
          case "input": {
            const unit = new InputUnit(ctx);
            try {
              await unit.open();
            } catch (err) {
              console.warn("Audio input unavailable:", err);
            }
            return unit;
          }
          case "constant":
            return new ConstantUnit(ctx, this.values.get(nodeId) ?? def.value ?? 0);
          case "terminal-in":
            return new TerminalUnit(ctx, "in");
          case "terminal-out":
            return new TerminalUnit(ctx, "out");
          // TODO(#3): flatten the child subgraph and wire it to these boundaries.
          case "patch":
            return new PatchStubUnit(ctx, def.inputs.length, def.outputs.length);
          case "module": {
            // Ported Faust example: precompiled factory + params-as-control-inputs.
            const worklet = await FaustService.createFactoryNode(def.id, ctx);
            return new ModuleUnit(ctx, worklet, def.inputs);
          }
          case "widget": {
            let widgetUnit: AudioUnit;
            switch (def.widget) {
              case "scope":
                widgetUnit = new ScopeUnit(ctx);
                break;
              case "spectrogram":
              case "spectrum":
                widgetUnit = new SpectrumUnit(ctx);
                break;
              case "tuner":
              case "freqmeter":
                widgetUnit = new TunerUnit(ctx);
                break;
              case "sequencer": {
                const steps = Number(def.widgetConfig?.steps ?? 8);
                widgetUnit = await SequencerUnit.create(ctx, new Array(steps).fill(0));
                break;
              }
              case "knob":
              case "slider":
              case "button":
                widgetUnit = new ConstantUnit(ctx, Number(def.widgetConfig?.default ?? 0));
                break;
              case "keyboard":
                widgetUnit = new GateFreqUnit(ctx, false);
                break;
              case "midi":
                widgetUnit = new GateFreqUnit(ctx, true);
                break;
              case "xypad":
                widgetUnit = new Vec2Unit(ctx);
                break;
              case "sampler":
                widgetUnit = await SamplerUnit.create(ctx);
                break;
              case "granular":
                widgetUnit = await GranularUnit.create(ctx);
                break;
              case "comment":
                widgetUnit = new NullUnit();
                break;
              case "record":
                widgetUnit = new MeterUnit(ctx); // taps the "on" input; body drives the recorder
                break;
              default:
                widgetUnit = new MeterUnit(ctx); // meters + LEDs
            }
            Monitors.set(nodeId, widgetUnit);
            return widgetUnit;
          }
          default: {
            let worklet;
            if (def.code) {
              // User-authored custom block: compile the Faust source with libfaust.
              const compiled = await FaustService.compile(def.id, def.code);
              worklet = await FaustService.createNode(compiled, ctx);
            } else {
              // Built-in block: load its precompiled WASM factory (no compiler).
              worklet = await FaustService.createFactoryNode(def.id, ctx);
            }
            return new FaustUnit(ctx, worklet, def.inputs);
          }
        }
      } catch (err) {
        // A single failed node must not break the whole patch — but make it visible
        // rather than silently producing no sound.
        const msg = `"${def.title}" failed: ${(err as Error).message}`;
        console.error(`Failed to realize node "${nodeId}" (${def.id}):`, err);
        this.collectErrors?.push(msg);
        this.onNodeError?.(msg);
        // Keep the (null) result cached so connections don't re-trigger the failed
        // load; stop() clears units, so a later start() retries cleanly.
        return null;
      }
    })();

    this.units.set(nodeId, promise);
    return promise;
  }

  private async realizeConn(conn: Conn) {
    const [srcUnit, dstUnit] = await Promise.all([
      this.units.get(conn.src) ?? this.realizeNode(conn.src),
      this.units.get(conn.dst) ?? this.realizeNode(conn.dst),
    ]);
    const src = await srcUnit;
    const dst = await dstUnit;
    const out = src?.output(conn.srcIdx);
    const inp = dst?.input(conn.dstIdx);
    if (out && inp) {
      try {
        out.node.connect(inp.node, out.channel, inp.channel);
        // A real signal now drives this input — detach its fallback default.
        dst?.onInputConnected(conn.dstIdx, true);
      } catch (err) {
        console.warn("connect failed", err);
      }
    }
  }

  private async unrealizeConn(conn: Conn) {
    const src = await this.units.get(conn.src);
    const dst = await this.units.get(conn.dst);
    const out = src?.output(conn.srcIdx);
    const inp = dst?.input(conn.dstIdx);
    if (out && inp) {
      try {
        out.node.disconnect(inp.node, out.channel, inp.channel);
      } catch {
        /* already disconnected */
      }
    }
    // Restore the default source only if no other connection targets this input.
    if (dst && this.countConns(conn.dst, conn.dstIdx) === 0) {
      dst.onInputConnected(conn.dstIdx, false);
    }
  }

  private countConns(dst: string, dstIdx: number): number {
    let n = 0;
    for (const c of this.conns.values()) {
      if (c.dst === dst && c.dstIdx === dstIdx) n++;
    }
    return n;
  }
}

export const AudioGraph = new AudioGraphImpl();
