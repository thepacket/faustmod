/**
 * YIN pitch detection (de Cheveigné & Kawahara). The cumulative-mean-normalized
 * difference function robustly picks the fundamental period of a windowed
 * time-domain buffer, avoiding the octave errors that plain autocorrelation
 * suffers on pure tones. Returns the frequency in Hz, or null if too quiet /
 * no clear pitch. Shared by the Tuner and Frequency Meter widgets.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / n) < 0.01) return null; // too quiet / silent

  const maxLag = Math.min(Math.floor(sampleRate / 30), n >> 1); // down to 30 Hz
  const minLag = Math.max(2, Math.floor(sampleRate / 5000)); // up to 5 kHz
  const W = n - maxLag; // fixed comparison window for every lag (no length bias)

  // Difference function d(lag) = Σ (buf[i] − buf[i+lag])².
  const d = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + lag];
      sum += diff * diff;
    }
    d[lag] = sum;
  }
  // Cumulative mean normalized difference: d'(lag) = d(lag)·lag / Σ_{1..lag} d.
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += d[lag];
    cmnd[lag] = running > 0 ? (d[lag] * lag) / running : 1;
  }
  // First lag below the threshold that is a local minimum → the fundamental period.
  const threshold = 0.15;
  let tau = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < threshold) {
      while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++;
      tau = lag;
      break;
    }
  }
  if (tau === -1) {
    // Nothing below threshold: fall back to the global minimum of the CMNDF.
    let best = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (cmnd[lag] < best) {
        best = cmnd[lag];
        tau = lag;
      }
    }
    if (tau <= 0 || best > 0.4) return null; // no clear pitch
  }
  // Parabolic interpolation on the difference function for sub-sample accuracy.
  const x0 = tau > 1 ? d[tau - 1] : d[tau];
  const x2 = tau + 1 <= maxLag ? d[tau + 1] : d[tau];
  const denom = 2 * (2 * d[tau] - x2 - x0);
  const shift = denom !== 0 ? Math.max(-1, Math.min(1, (x2 - x0) / denom)) : 0;
  const period = tau + shift;
  return period > 0 ? sampleRate / period : null;
}
