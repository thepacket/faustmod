import { AudioEngine } from "./AudioEngine";
import { FaustService } from "./FaustService";
import {
  FaustUnit,
  ModuleUnit,
  ConstantUnit,
  OutputUnit,
  InputUnit,
  TerminalUnit,
  PatchUnit,
  StubUnit,
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
import { EmbeddablePatches } from "../patch/embeddablePatches";
import { derivePatchSignature } from "../patch/signature";
import type { ComponentDef } from "../components/library";

/** Per-node data the unit factory needs beyond the component definition. */
interface NodeData {
  nodeId?: string;
  value?: number;
  code?: string;
  overrideInputs?: InputSpec[];
  state?: Record<string, unknown>;
  /** Register widgets in Monitors (top-level only — embedded widgets have no UI). */
  registerMonitors: boolean;
  /** Patch ids currently being realized, to break embedding cycles. */
  seen: Set<string>;
}

/** Parse a socket key like "out-3" / "in-1" into its channel index. */
const socketIndex = (key: string) => parseInt(key.split("-")[1] ?? "0", 10);

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
      const override = this.overrides.get(nodeId);
      try {
        return await this.createUnit(ctx, def, {
          nodeId,
          value: this.values.get(nodeId),
          code: override?.code,
          overrideInputs: override?.inputs,
          registerMonitors: true,
          seen: new Set(),
        });
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

  /**
   * Build one AudioUnit from a component definition + per-node data. Shared by the
   * top-level graph and by embedded patches (which realize their children through the
   * same factory — so embedding nests to any depth).
   */
  private async createUnit(
    ctx: BaseAudioContext,
    def: ComponentDef,
    data: NodeData,
  ): Promise<AudioUnit | null> {
    // Edited Faust source (module editor override, or a per-node override captured in
    // an embedded patch): compile it instead of loading the stock factory.
    if (data.code) {
      const compiled = await FaustService.compile(`${def.id}-edit`, data.code);
      const worklet = await FaustService.createNode(compiled, ctx);
      return new FaustUnit(ctx, worklet, data.overrideInputs ?? def.inputs);
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
        return new ConstantUnit(ctx, data.value ?? def.value ?? 0);
      case "terminal-in":
        return new TerminalUnit(ctx, "in");
      case "terminal-out":
        return new TerminalUnit(ctx, "out");
      case "patch":
        return this.realizePatch(ctx, def, data.seen);
      // TODO(pd-engine): run the .pd via WebPd / libpd-WASM. Silent stub for now.
      case "pd":
        return new StubUnit(ctx, def.inputs.length, def.outputs.length);
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
          case "button": {
            // Top-level: the React body drives the value via Monitors, so start at the
            // config default. Embedded (no UI): use the stored value from widgetState.
            const v = data.registerMonitors
              ? Number(def.widgetConfig?.default ?? 0)
              : Number(data.state?.value ?? def.widgetConfig?.default ?? 0);
            widgetUnit = new ConstantUnit(ctx, v);
            break;
          }
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
        if (data.registerMonitors && data.nodeId) Monitors.set(data.nodeId, widgetUnit);
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
  }

  /**
   * Flatten an embedded patch: build all of its child nodes as units, wire the child's
   * internal connections, and expose the patch's ports as the boundary nodes of its
   * I/O terminals. Recurses through nested patches (with a cycle guard).
   */
  private async realizePatch(
    ctx: BaseAudioContext,
    def: ComponentDef,
    seen: Set<string>,
  ): Promise<AudioUnit> {
    const nulls = (n: number) => new Array<AudioNode | null>(n).fill(null);
    if (seen.has(def.id)) {
      this.collectErrors?.push(`Patch "${def.title}" embeds itself — skipped`);
      return new PatchUnit([], nulls(def.inputs.length), nulls(def.outputs.length));
    }
    const patchDef = EmbeddablePatches.get(def.id);
    if (!patchDef) return new PatchUnit([], nulls(def.inputs.length), nulls(def.outputs.length));

    const nextSeen = new Set(seen).add(def.id);
    const byId = new Map<string, AudioUnit>();
    const children: AudioUnit[] = [];

    for (const n of patchDef.patch.nodes) {
      const cdef = resolveComponent(n.componentId);
      if (!cdef) continue;
      const unit = await this.createUnit(ctx, cdef, {
        nodeId: n.id,
        value: n.value,
        code: n.code,
        state: n.state,
        registerMonitors: false,
        seen: nextSeen,
      });
      if (unit) {
        byId.set(n.id, unit);
        children.push(unit);
      }
    }

    // Wire the child's internal connections (same rule as the top-level graph).
    for (const c of patchDef.patch.connections) {
      const src = byId.get(c.source);
      const dst = byId.get(c.target);
      if (!src || !dst) continue;
      const out = src.output(socketIndex(c.sourceOutput));
      const dstIdx = socketIndex(c.targetInput);
      const inp = dst.input(dstIdx);
      if (out && inp) {
        try {
          out.node.connect(inp.node, out.channel, inp.channel);
          dst.onInputConnected(dstIdx, true);
        } catch (err) {
          console.warn("child connect failed", err);
        }
      }
    }

    // Ports map to the terminals' boundary GainNodes, in signature order.
    const sig = derivePatchSignature(patchDef.patch.nodes);
    const boundary = (id: string) => {
      const u = byId.get(id);
      return u instanceof TerminalUnit ? u.gain : null;
    };
    return new PatchUnit(
      children,
      sig.inputTerminals.map(boundary),
      sig.outputTerminals.map(boundary),
    );
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
