import { AudioDevices } from "./devices";

/**
 * Owns the AudioContext and the master output chain. Created lazily on the first
 * user gesture (browsers require a gesture before audio can start). Also handles
 * recording the master output and selecting the output device.
 */
class AudioEngineImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];

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
      if (AudioDevices.outputDeviceId) await this.applyOutputDevice(AudioDevices.outputDeviceId);
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

  // ---- Output device -----------------------------------------------------
  async setOutputDevice(deviceId: string): Promise<void> {
    AudioDevices.outputDeviceId = deviceId || null;
    if (this.ctx) await this.applyOutputDevice(deviceId);
  }
  private async applyOutputDevice(deviceId: string): Promise<void> {
    const setSinkId = (this.ctx as unknown as { setSinkId?: (id: string) => Promise<void> })
      ?.setSinkId;
    if (setSinkId) {
      try {
        await setSinkId.call(this.ctx, deviceId);
      } catch (err) {
        console.warn("setSinkId failed:", err);
      }
    }
  }

  // ---- Recording (master output) ----------------------------------------
  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  async startRecording(): Promise<void> {
    await this.ensure();
    if (!this.recDest) {
      this.recDest = this.ctx!.createMediaStreamDestination();
      this.master!.connect(this.recDest);
    }
    this.recChunks = [];
    this.recorder = new MediaRecorder(this.recDest.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.recChunks.push(e.data);
    };
    this.recorder.start();
  }

  /** Stop recording and return the captured audio blob (webm). */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      const rec = this.recorder;
      if (!rec || rec.state === "inactive") {
        resolve(new Blob(this.recChunks, { type: "audio/webm" }));
        return;
      }
      rec.onstop = () => resolve(new Blob(this.recChunks, { type: "audio/webm" }));
      rec.stop();
      this.recorder = null;
    });
  }
}

export const AudioEngine = new AudioEngineImpl();
