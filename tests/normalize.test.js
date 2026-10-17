import { describe, it, expect } from 'vitest';
import { normalizeGain, applyGain, TARGET_PEAK, MAX_GAIN } from '../src/audio/normalize.js';

describe('normalizeGain', () => {
  it('brings a quiet take up to the target peak', () => {
    const chunks = [Float32Array.from([0.01, -0.1]), Float32Array.from([0.05])];
    const gain = normalizeGain(chunks);
    expect(gain).toBeCloseTo(TARGET_PEAK / 0.1);
    applyGain(chunks, gain);
    expect(chunks[0][1]).toBeCloseTo(-TARGET_PEAK);
  });

  it('caps the gain for near-silent takes', () => {
    expect(normalizeGain([Float32Array.from([0.001])])).toBe(MAX_GAIN);
  });

  it('never turns a loud take down, and leaves silence alone', () => {
    expect(normalizeGain([Float32Array.from([0.99])])).toBe(1);
    expect(normalizeGain([new Float32Array(10)])).toBe(1);
    expect(normalizeGain([])).toBe(1);
  });
});
