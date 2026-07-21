/**
 * Owns the AudioContext and the master output chain. Created lazily on the first
 * user gesture (browsers require a gesture before audio can start).
 */
class AudioEngineImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get masterNode(): AudioNode | null {
    return this.master;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Ensure the context + master gain exist. Safe to call repeatedly. */
  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") {
      await this.ctx.suspend();
    }
  }

  get masterVolume(): number {
    return this.master ? this.master.gain.value : 0.8;
  }

  setMasterVolume(v: number) {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }
}

export const AudioEngine = new AudioEngineImpl();
