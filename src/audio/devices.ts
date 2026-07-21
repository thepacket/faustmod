/** Selected audio input/output devices, shared across the app. */
export const AudioDevices: { inputDeviceId: string | null; outputDeviceId: string | null } = {
  inputDeviceId: null,
  outputDeviceId: null,
};

export interface DeviceList {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
}

/**
 * Enumerate audio devices. Device labels are only exposed after the user has
 * granted microphone permission at least once, so callers may want to request it.
 */
export async function listAudioDevices(): Promise<DeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: devices.filter((d) => d.kind === "audioinput"),
    outputs: devices.filter((d) => d.kind === "audiooutput"),
  };
}

/** Request mic permission so device labels populate. Resolves false if denied. */
export async function requestDevicePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/** True if choosing an output device (setSinkId) is supported by this browser. */
export function canSelectOutput(): boolean {
  return typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId === "function";
}
