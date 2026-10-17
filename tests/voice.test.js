import { describe, it, expect } from 'vitest';
import { curveAt, phrases, targetRatios, changeSpeed, dialectVoice, pitchTrack } from '../src/dialects/voice.js';
import { sawtooth, silence, centsBetween } from './signals.js';
import { midiToFreq } from '../src/dsp/notes.js';

const SR = 48000;

/** Median detected frequency of the middle part of a signal. */
function medianFreq(samples) {
  const track = pitchTrack(samples, SR).filter((m) => m != null);
  const mid = track.slice(Math.floor(track.length * 0.25), Math.floor(track.length * 0.75)).sort((a, b) => a - b);
  return midiToFreq(mid[mid.length >> 1]);
}

describe('curveAt', () => {
  it('interpolates evenly spaced points', () => {
    expect(curveAt([0, 4], 0.5)).toBe(2);
    expect(curveAt([0, 2, -2], 1)).toBe(-2);
    expect(curveAt([0, 2, -2], 0.25)).toBe(1);
    expect(curveAt([3], 0.7)).toBe(3);
    expect(curveAt([], 0.7)).toBe(0);
    expect(curveAt([0, 4], 2)).toBe(4);
  });
});

describe('phrases', () => {
  it('splits voiced frames at long pauses only', () => {
    const t = [60, 60, null, 60, null, null, null, 62, 62];
    expect(phrases(t, 3)).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 9 },
    ]);
  });
});

describe('targetRatios', () => {
  it('flattens movement around the phrase median', () => {
    const track = [58, 60, 62];
    const r = targetRatios(track, { flatten: 0 }, SR);
    expect(r[1]).toBeCloseTo(1);
    expect(12 * Math.log2(r[0])).toBeCloseTo(2);
    expect(12 * Math.log2(r[2])).toBeCloseTo(-2);
  });

  it('compensates tempo and leaves unvoiced frames alone', () => {
    const r = targetRatios([60, null], { tempo: 0.8 }, SR);
    expect(r[0]).toBeCloseTo(1 / 0.8);
    expect(r[1]).toBe(1);
  });
});

describe('changeSpeed', () => {
  it('changes length by the speed factor', () => {
    expect(changeSpeed(new Float32Array(1000), 0.5).length).toBe(2000);
    expect(changeSpeed(new Float32Array(1000), 2).length).toBe(500);
  });
});

describe('dialectVoice', () => {
  const voice = sawtooth(200, SR, SR); // 1 s "voice" at 200 Hz

  it('keeps pitch and length with neutral settings', () => {
    const out = dialectVoice(voice, SR, {});
    expect(out.length).toBe(voice.length);
    expect(Math.abs(centsBetween(medianFreq(out), 200))).toBeLessThan(30);
  });

  it('shifts the pitch by the given semitones', () => {
    const out = dialectVoice(voice, SR, { shift: 3 });
    expect(Math.abs(centsBetween(medianFreq(out), 200 * 2 ** (3 / 12)))).toBeLessThan(40);
  });

  it('changes tempo without changing pitch', () => {
    const out = dialectVoice(voice, SR, { tempo: 0.8 });
    expect(out.length).toBe(Math.floor(voice.length / 0.8));
    expect(Math.abs(centsBetween(medianFreq(out), 200))).toBeLessThan(40);
  });

  it('passes silence through', () => {
    const out = dialectVoice(silence(SR / 2), SR, { shift: 5, tempo: 0.9 });
    expect(out.every((x) => x === 0)).toBe(true);
  });
});
