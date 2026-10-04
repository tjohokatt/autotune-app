// Synthetic test signals.

export function sine(freq, sampleRate, length, amplitude = 0.5) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

/** Naive (non-band-limited) sawtooth: rich in harmonics, like a voice. */
export function sawtooth(freq, sampleRate, length, amplitude = 0.5) {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const phase = ((freq * i) / sampleRate) % 1;
    out[i] = amplitude * (2 * phase - 1);
  }
  return out;
}

/** Deterministic white noise (LCG), so tests are reproducible. */
export function noise(length, amplitude = 0.5, seed = 1) {
  const out = new Float32Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = amplitude * ((s / 2 ** 32) * 2 - 1);
  }
  return out;
}

export function silence(length) {
  return new Float32Array(length);
}

export function centsBetween(a, b) {
  return 1200 * Math.log2(a / b);
}
