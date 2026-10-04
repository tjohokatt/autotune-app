import { describe, it, expect } from 'vitest';
import { createAutotune } from '../src/dsp/autotune.js';
import { createYin } from '../src/dsp/yin.js';
import { midiToFreq } from '../src/dsp/notes.js';
import { sawtooth, noise, centsBetween } from './signals.js';

const SR = 48000;
const BLOCK = 128;

function run(signal, options, params = { retuneMs: 0, mix: 1 }) {
  const at = createAutotune(SR);
  at.setOptions(options);
  const out = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i += BLOCK) {
    at.process(signal.subarray(i, i + BLOCK), out.subarray(i, i + BLOCK), params);
  }
  return { out, status: at.status };
}

function pitchAt(signal, start) {
  return createYin(SR, 2048)(signal.subarray(start, start + 2048)).freq;
}

describe('autotune chain', () => {
  it('pulls an out-of-tune note to the nearest semitone (robot)', () => {
    const sung = 450; // A4 + 39 cents
    const { out, status } = run(sawtooth(sung, SR, SR), { scale: 'chromatic' });
    expect(status.targetMidi).toBe(69);
    expect(Math.abs(centsBetween(pitchAt(out, SR / 2), 440))).toBeLessThan(10);
  });

  it('snaps to the selected scale', () => {
    const sung = midiToFreq(61.3); // C#4 + 30 cents → C major has C and D
    const { out } = run(sawtooth(sung, SR, SR), { scale: 'major', key: 0 });
    expect(Math.abs(centsBetween(pitchAt(out, SR / 2), midiToFreq(62)))).toBeLessThan(10);
  });

  it('transposes an octave up (chipmunk) and down (monster)', () => {
    const up = run(sawtooth(220, SR, SR), { transpose: 12, formantShift: 1.5 }).out;
    expect(Math.abs(centsBetween(pitchAt(up, SR / 2), 440))).toBeLessThan(10);

    const down = run(sawtooth(440, SR, SR), { transpose: -12, formantShift: 0.75 }).out;
    expect(Math.abs(centsBetween(pitchAt(down, SR / 2), 220))).toBeLessThan(10);
  });

  it('a slow retune glides into the note instead of jumping', () => {
    const { out } = run(sawtooth(450, SR, SR), { scale: 'chromatic' }, { retuneMs: 200, mix: 1 });
    // ~100 ms in: still clearly sharp of 440 (only part of the way there)…
    expect(centsBetween(pitchAt(out, Math.round(0.1 * SR)), 440)).toBeGreaterThan(10);
    // …and in tune well after 3τ.
    expect(Math.abs(centsBetween(pitchAt(out, SR - 2048), 440))).toBeLessThan(10);
  });

  it('mix = 0 gives the dry (delayed) input', () => {
    const input = sawtooth(450, SR, SR);
    const at = createAutotune(SR);
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i += BLOCK) {
      at.process(input.subarray(i, i + BLOCK), out.subarray(i, i + BLOCK), { retuneMs: 0, mix: 0 });
    }
    expect(out[SR / 2]).toBe(input[SR / 2 - at.latency]);
  });

  it('passes noise through unprocessed and reports no pitch', () => {
    const input = noise(SR, 0.3);
    const { out, status } = run(input, { transpose: 12 });
    expect(status.freq).toBeNull();
    expect(status.targetMidi).toBeNull();
    const at = createAutotune(SR);
    expect(out[SR / 2]).toBeCloseTo(input[SR / 2 - at.latency], 4);
  });

  it('never produces NaN or runaway values on a messy signal', () => {
    // Sung notes, a glide and silence/noise sections back to back.
    const parts = [sawtooth(200, SR, SR / 4), noise(SR / 4, 0.2), new Float32Array(SR / 8)];
    const glide = new Float32Array(SR / 2);
    let phase = 0;
    for (let i = 0; i < glide.length; i++) {
      phase += (150 + (600 * i) / glide.length) / SR;
      glide[i] = 0.5 * (2 * (phase % 1) - 1);
    }
    parts.push(glide);
    const total = parts.reduce((s, p) => s + p.length, 0);
    const input = new Float32Array(total);
    let o = 0;
    for (const p of parts) {
      input.set(p, o);
      o += p.length;
    }
    const { out } = run(input, { scale: 'major', transpose: 12, formantShift: 1.5 });
    expect(out.every((v) => Number.isFinite(v) && Math.abs(v) < 2)).toBe(true);
  });
});
