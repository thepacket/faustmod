import { AudioEngine } from "./AudioEngine";
import { FaustService } from "./FaustService";
import { FaustUnit, ConstantUnit, OutputUnit, InputUnit } from "./units";
import type { AudioUnit } from "./types";
import { LIBRARY_BY_ID } from "../components/library";

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

  async removeNode(nodeId: string) {
    this.desiredNodes.delete(nodeId);
    this.values.delete(nodeId);
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
    for (const p of all) (await p)?.dispose();
    await AudioEngine.suspend();
  }

  /** Discard the entire desired graph (used when loading a new patch). */
  async clear() {
    await this.stop();
    this.desiredNodes.clear();
    this.conns.clear();
    this.values.clear();
  }

  // ---- realization -------------------------------------------------------

  private async realizeNode(nodeId: string): Promise<AudioUnit | null> {
    const existing = this.units.get(nodeId);
    if (existing) return existing;

    const componentId = this.desiredNodes.get(nodeId);
    const def = componentId ? LIBRARY_BY_ID.get(componentId) : undefined;
    if (!def) return null;

    const promise = (async (): Promise<AudioUnit | null> => {
      const ctx = AudioEngine.context!;
      try {
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
          default: {
            // Built-in blocks load a precompiled WASM factory on demand (no compiler).
            const worklet = await FaustService.createFactoryNode(def.id, ctx);
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
