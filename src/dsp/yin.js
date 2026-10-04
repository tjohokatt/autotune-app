// YIN pitch detection (de Cheveigné & Kawahara, 2002).
//
// Given a window x[0..N-1], YIN looks for the lag τ (in samples) at which the
// signal best matches a copy of itself shifted by τ. That lag is the period,
// and frequency = sampleRate / τ.
//
// Steps (numbered as in the paper):
//  2. Difference function   d(τ)  = Σ_j (x[j] − x[j+τ])²,  j = 0..W−1
//  3. Cumulative mean normalized difference
//                           d'(τ) = d(τ) · τ / Σ_{k=1..τ} d(k),   d'(0) = 1
//     This removes the bias towards τ = 0 and makes d' roughly scale-free:
//     ~0 for a perfectly periodic signal, ~1 for noise.
//  4. Absolute threshold: take the first τ where d' dips below a threshold
//     (then walk down to the bottom of that dip). Taking the *first* dip
//     instead of the global minimum avoids picking 2×, 3× the period
//     (octave-too-low errors).
//  5. Parabolic interpolation around the chosen τ for sub-sample precision.
//
// Confidence is reported as 1 − d'(τ): close to 1 for a clean tone, close to 0
// for noise or silence.

/**
 * Create a YIN detector with preallocated buffers, so `detect` never allocates
 * (important inside an AudioWorklet, where GC pauses cause audio glitches).
 *
 * @param {number} sampleRate
 * @param {number} bufferSize  length of the buffers passed to `detect`
 * @param {object} [opts]
 * @param {number} [opts.minFreq=70]     lowest detectable frequency (Hz)
 * @param {number} [opts.maxFreq=1100]   highest detectable frequency (Hz)
 * @param {number} [opts.threshold=0.15] d' threshold for step 4
 * @param {number} [opts.minRms=0.005]   below this level the input counts as silence
 * @returns {(buffer: Float32Array) => { freq: number | null, confidence: number }}
 */
export function createYin(sampleRate, bufferSize, opts = {}) {
  const { minFreq = 70, maxFreq = 1100, threshold = 0.15, minRms = 0.005 } = opts;

  // Lag range that corresponds to the frequency range.
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.ceil(sampleRate / minFreq);
  // Integration window: whatever is left of the buffer after the largest lag.
  const windowSize = bufferSize - tauMax;
  if (windowSize < tauMax) {
    throw new Error(
      `YIN buffer too small: ${bufferSize} samples cannot cover ${minFreq} Hz at ${sampleRate} Hz`,
    );
  }

  const cmnd = new Float32Array(tauMax + 1);
  const silent = { freq: null, confidence: 0 };

  return function detect(buffer) {
    // Silence gate: skip the expensive search for very quiet input.
    let energy = 0;
    for (let i = 0; i < bufferSize; i++) energy += buffer[i] * buffer[i];
    if (Math.sqrt(energy / bufferSize) < minRms) return silent;

    // Steps 2 + 3 in one pass.
    cmnd[0] = 1;
    let runningSum = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      let d = 0;
      for (let j = 0; j < windowSize; j++) {
        const diff = buffer[j] - buffer[j + tau];
        d += diff * diff;
      }
      runningSum += d;
      cmnd[tau] = runningSum > 0 ? (d * tau) / runningSum : 1;
    }

    // Step 4: first dip below the threshold, followed to its local minimum.
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (cmnd[t] < threshold) {
        while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) {
      // No clear periodicity. Still report how close the best candidate was.
      let best = 1;
      for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < best) best = cmnd[t];
      return { freq: null, confidence: Math.max(0, 1 - best) };
    }

    // Step 5: fit a parabola through (τ−1, τ, τ+1) and take its vertex.
    let betterTau = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = cmnd[tau - 1];
      const s1 = cmnd[tau];
      const s2 = cmnd[tau + 1];
      const denom = s0 - 2 * s1 + s2;
      if (denom !== 0) betterTau = tau + (s0 - s2) / (2 * denom);
    }

    return {
      freq: sampleRate / betterTau,
      confidence: Math.max(0, Math.min(1, 1 - cmnd[tau])),
    };
  };
}
