/**
 * Reciprocal period counting (like a hardware frequency counter): measure the exact,
 * sub-sample-interpolated span across every complete period in the window and divide
 * — f = (edges − 1) · sampleRate / span. A software Schmitt trigger (hysteresis around
 * the DC-removed zero level) yields exactly one rising edge per period, robust for
 * oscillator/VCO signals. Averaging over all periods in the window makes it accurate
 * and stable across ~20 Hz – 20 kHz. Returns Hz, or null if silent / < 2 edges.
 */
export function detectFrequency(buf: Float32Array, sampleRate: number): number | null {
  const n = buf.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += buf[i];
  mean /= n; // remove any DC offset so crossings sit at zero

  let peak = 0;
  let sumsq = 0;
  for (let i = 0; i < n; i++) {
    const d = buf[i] - mean;
    sumsq += d * d;
    const a = Math.abs(d);
    if (a > peak) peak = a;
  }
  if (Math.sqrt(sumsq / n) < 0.005 || peak < 0.01) return null; // silent / DC
  const hyst = 0.25 * peak; // Schmitt-trigger hysteresis

  let armed = false;
  let firstEdge = -1;
  let lastEdge = -1;
  let count = 0;
  let prev = buf[0] - mean;
  for (let i = 1; i < n; i++) {
    const v = buf[i] - mean;
    if (v < -hyst) {
      armed = true; // dipped low enough to re-arm
    } else if (armed && prev < 0 && v >= 0) {
      // Rising zero-crossing — linear-interpolate the fractional sample position.
      const frac = prev !== v ? -prev / (v - prev) : 0;
      const edge = i - 1 + frac;
      if (firstEdge < 0) firstEdge = edge;
      lastEdge = edge;
      count++;
      armed = false;
    }
    prev = v;
  }
  if (count < 2) return null; // need at least one full period
  const span = lastEdge - firstEdge;
  return span > 0 ? ((count - 1) * sampleRate) / span : null;
}

/**
 * Dominant-frequency estimate from an FFT magnitude spectrum (dB per bin, e.g.
 * AnalyserNode.getFloatFrequencyData), refined with parabolic interpolation for
 * sub-bin accuracy. Robust across the whole range — in particular at high audio
 * frequencies where reciprocal counting fails (too few samples per period at the
 * sample-rate "clock"). `binHz` = sampleRate / fftSize. Returns Hz or null.
 */
export function detectFrequencyFFT(fdDb: Float32Array, binHz: number): number | null {
  const minBin = Math.max(2, Math.round(20 / binHz)); // ignore DC / sub-20 Hz
  const maxBin = fdDb.length - 2;
  let peakBin = -1;
  let peakVal = -Infinity;
  for (let i = minBin; i <= maxBin; i++) {
    if (fdDb[i] > peakVal) {
      peakVal = fdDb[i];
      peakBin = i;
    }
  }
  if (peakBin < 0 || peakVal < -80) return null; // silent / no clear peak
  const a = fdDb[peakBin - 1];
  const b = fdDb[peakBin];
  const c = fdDb[peakBin + 1];
  const denom = a - 2 * b + c;
  const p = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return (peakBin + p) * binHz;
}

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
