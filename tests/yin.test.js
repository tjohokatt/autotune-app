import { describe, it, expect } from 'vitest';
import { createYin } from '../src/dsp/yin.js';
import { sine, sawtooth, noise, silence, centsBetween } from './signals.js';

const BUFFER = 2048;

describe.each([44100, 48000])('YIN at %i Hz', (sampleRate) => {
  const detect = createYin(sampleRate, BUFFER);

  describe.each([
    ['sine', sine],
    ['sawtooth', sawtooth],
  ])('%s', (_, gen) => {
    it.each([82.41, 220, 440, 523.25, 987.77])('detects %f Hz within ±5 cents', (freq) => {
      const { freq: detected, confidence } = detect(gen(freq, sampleRate, BUFFER));
      expect(detected).not.toBeNull();
      expect(Math.abs(centsBetween(detected, freq))).toBeLessThan(5);
      expect(confidence).toBeGreaterThan(0.85);
    });
  });

  it('reports no pitch and zero confidence for silence', () => {
    expect(detect(silence(BUFFER))).toEqual({ freq: null, confidence: 0 });
  });

  it('reports no pitch and low confidence for white noise', () => {
    const { freq, confidence } = detect(noise(BUFFER));
    expect(freq).toBeNull();
    expect(confidence).toBeLessThan(0.85);
  });

  it('ignores a very quiet tone (below the silence gate)', () => {
    expect(detect(sine(440, sampleRate, BUFFER, 0.001)).freq).toBeNull();
  });
});

describe('createYin', () => {
  it('rejects a buffer too small for the lowest frequency', () => {
    expect(() => createYin(48000, 512)).toThrow(/too small/);
  });
});
