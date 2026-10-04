import { describe, it, expect } from 'vitest';
import { createPsola, psolaLatency } from '../src/dsp/psola.js';
import { createYin } from '../src/dsp/yin.js';
import { sine, sawtooth, noise, centsBetween } from './signals.js';

const SR = 48000;
const BLOCK = 128;
const LENGTH = SR; // 1 s

/** Run a whole signal through PSOLA in 128-sample blocks with fixed params. */
function shift(signal, params) {
  const psola = createPsola(SR);
  const wet = new Float32Array(signal.length);
  const dry = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i += BLOCK) {
    psola.process(signal.subarray(i, i + BLOCK), wet.subarray(i, i + BLOCK), dry.subarray(i, i + BLOCK), params);
  }
  return { wet, dry, latency: psola.latency };
}

/** Pitch of the steady-state middle of a signal. */
function pitchOf(signal) {
  return createYin(SR, 2048)(signal.subarray(SR / 2, SR / 2 + 2048)).freq;
}

function rms(x) {
  return Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
}

describe('psola', () => {
  it('has ~25 ms latency at 48 kHz with a 75 Hz floor', () => {
    expect(psolaLatency(SR, 75)).toBe(1282);
  });

  it.each([
    ['one semitone up', 440, 2 ** (1 / 12)],
    ['a fifth up', 220, 1.5],
    ['an octave up', 220, 2],
    ['an octave down', 440, 0.5],
    ['a little down', 330, 2 ** (-0.4 / 12)],
  ])('shifts %s', (_, freq, ratio) => {
    for (const gen of [sine, sawtooth]) {
      const input = gen(freq, SR, LENGTH);
      const { wet } = shift(input, { period: SR / freq, ratio, formant: 1 });
      expect(Math.abs(centsBetween(pitchOf(wet), freq * ratio))).toBeLessThan(10);
    }
  });

  it('keeps the pitch when only the formants move', () => {
    for (const formant of [0.75, 1.5]) {
      const { wet } = shift(sawtooth(220, SR, LENGTH), { period: SR / 220, ratio: 1, formant });
      expect(Math.abs(centsBetween(pitchOf(wet), 220))).toBeLessThan(10);
    }
  });

  it('roughly preserves loudness when shifting up', () => {
    const input = sawtooth(220, SR, LENGTH);
    const { wet } = shift(input, { period: SR / 220, ratio: 1.5, formant: 1 });
    const ratio = rms(wet.subarray(SR / 2)) / rms(input.subarray(SR / 2));
    expect(ratio).toBeGreaterThan(0.7);
    expect(ratio).toBeLessThan(1.3);
  });

  it('keeps a pure tone (whistling) audible an octave up and down', () => {
    // Classic 2-period grains cancel a sine almost completely at ratio 2.
    for (const [freq, ratio] of [[440, 2], [220, 2], [440, 0.5]]) {
      const input = sine(freq, SR, LENGTH);
      const { wet } = shift(input, { period: SR / freq, ratio, formant: 1 });
      expect(rms(wet.subarray(SR / 2)) / rms(input.subarray(SR / 2))).toBeGreaterThan(0.5);
    }
  });

  it('reconstructs the delayed input at ratio 1', () => {
    const input = sawtooth(220, SR, LENGTH);
    const { wet, dry, latency } = shift(input, { period: SR / 220, ratio: 1, formant: 1 });
    // dry is exactly the input delayed by `latency`
    expect(dry[SR / 2]).toBe(input[SR / 2 - latency]);
    // wet matches dry up to small window/grid errors
    let err = 0;
    for (let i = SR / 2; i < SR; i++) err = Math.max(err, Math.abs(wet[i] - dry[i]));
    expect(err).toBeLessThan(0.05);
  });

  it('passes unvoiced input (period 0) through as the delayed input', () => {
    const input = noise(LENGTH, 0.3);
    const { wet, dry } = shift(input, { period: 0, ratio: 2, formant: 1.5 });
    let err = 0;
    for (let i = SR / 2; i < SR; i++) err = Math.max(err, Math.abs(wet[i] - dry[i]));
    expect(err).toBeLessThan(1e-4);
  });

  it('has no clicks: sample-to-sample jumps stay small for a shifted sine', () => {
    const { wet } = shift(sine(300, SR, LENGTH), { period: SR / 300, ratio: 1.26, formant: 1 });
    let maxStep = 0;
    for (let i = SR / 4; i < SR; i++) maxStep = Math.max(maxStep, Math.abs(wet[i] - wet[i - 1]));
    // A clean 378 Hz sine at amplitude 0.5 steps at most 2π·378/48000·0.5 ≈ 0.025.
    expect(maxStep).toBeLessThan(0.06);
  });
});
