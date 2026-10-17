import { describe, it, expect } from 'vitest';
import {
  normalizeGain,
  applyGain,
  levelOf,
  voiceGain,
  limit,
  mixTake,
  TARGET_PEAK,
  VOICE_LEVEL,
  MAX_GAIN,
  BACKING_BELOW,
  LIMIT_FROM,
} from '../src/audio/normalize.js';

const SR = 48000;
const sine = (amp, seconds = 1, freq = 220) =>
  Float32Array.from({ length: SR * seconds }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));
const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe('normalizeGain', () => {
  it('brings a quiet clip up to the target peak', () => {
    const chunks = [Float32Array.from([0.01, -0.1]), Float32Array.from([0.05])];
    const gain = normalizeGain(chunks);
    expect(gain).toBeCloseTo(TARGET_PEAK / 0.1);
    applyGain(chunks, gain);
    expect(chunks[0][1]).toBeCloseTo(-TARGET_PEAK);
  });

  it('caps the gain and never turns down', () => {
    expect(normalizeGain([Float32Array.from([0.001])])).toBe(MAX_GAIN);
    expect(normalizeGain([Float32Array.from([0.99])])).toBe(1);
    expect(normalizeGain([new Float32Array(10)])).toBe(1);
  });
});

describe('levelOf', () => {
  it('is the RMS of the singing, not of the pauses', () => {
    const voice = new Float32Array(SR * 2);
    voice.set(sine(0.1)); // 1 s of singing, 1 s of silence
    expect(levelOf([voice])).toBeCloseTo(0.1 / Math.SQRT2, 2);
  });

  it('ignores a single loud click', () => {
    const voice = sine(0.05);
    voice[1000] = 1;
    expect(levelOf([voice])).toBeLessThan(0.05);
  });

  it('is 0 for silence or nothing', () => {
    expect(levelOf([new Float32Array(SR)])).toBe(0);
    expect(levelOf([])).toBe(0);
  });
});

describe('voiceGain and limit', () => {
  it('brings the singing level up, within limits', () => {
    expect(voiceGain(0.02)).toBeCloseTo(VOICE_LEVEL / 0.02);
    expect(voiceGain(0.0001)).toBe(MAX_GAIN);
    expect(voiceGain(0.5)).toBe(1);
    expect(voiceGain(0)).toBe(1);
  });

  it('passes quiet samples and bends loud ones below 1', () => {
    expect(limit(0.5)).toBe(0.5);
    expect(limit(-LIMIT_FROM)).toBe(-LIMIT_FROM);
    expect(limit(1.5)).toBeLessThan(1);
    expect(limit(1.5)).toBeGreaterThan(limit(1.0));
    expect(limit(-3)).toBeGreaterThan(-1);
  });
});

describe('mixTake', () => {
  it('makes a quiet voice loud even with a loud backing track', () => {
    const voice = sine(0.01); // very quiet phone mic
    const backing = sine(0.8, 1, 110); // loud mastered song
    const [out] = mixTake([voice], [backing]);
    // Voice gained up, backing pulled down to half of it: total RMS ≈ voice level·√1.25.
    expect(rms(out)).toBeGreaterThan(VOICE_LEVEL * 0.9);
    expect(peak(out)).toBeLessThan(1);
    const [voiceOnly] = mixTake([voice], [new Float32Array(SR)]);
    expect(rms(voiceOnly)).toBeCloseTo(VOICE_LEVEL, 1);
  });

  it('keeps a quiet backing track as it is', () => {
    const backing = sine(0.01, 1, 110);
    const [out] = mixTake([new Float32Array(SR)], [backing]);
    expect(rms(out)).toBeCloseTo(rms(backing), 4);
    expect(BACKING_BELOW * VOICE_LEVEL).toBeGreaterThan(rms(backing));
  });

  it('works without a backing channel', () => {
    const [out] = mixTake([sine(0.02)]);
    expect(rms(out)).toBeCloseTo(VOICE_LEVEL, 1);
  });
});
