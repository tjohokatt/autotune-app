import { describe, it, expect } from 'vitest';
import { createAutotune, softLimit } from '../src/dsp/autotune.js';
import { createYin } from '../src/dsp/yin.js';
import { midiToFreq } from '../src/dsp/notes.js';
import { sawtooth, noise, centsBetween } from './signals.js';

const SR = 48000;
const BLOCK = 128;

function run(signal, options, params = { retuneMs: 0, mix: 1 }) {
  const at = createAutotune(SR);
  at.setOptions(options);
  const out = new Float32Array(signal.length);
  const right = new Float32Array(signal.length);
  for (let i = 0; i < signal.length; i += BLOCK) {
    at.process(signal.subarray(i, i + BLOCK), out.subarray(i, i + BLOCK), right.subarray(i, i + BLOCK), params);
  }
  return { out, right, status: at.status };
}

function pitchAt(signal, start) {
  return createYin(SR, 2048)(signal.subarray(start, start + 2048)).freq;
}

describe('autotune chain', () => {
  it.each([82.41, 220, 440, 523.25, 987.77])('detects %f Hz within ±5 cents despite the 2× decimation', (freq) => {
    for (const sr of [44100, 48000]) {
      const at = createAutotune(sr);
      const sig = sawtooth(freq, sr, sr / 2);
      const out = new Float32Array(BLOCK);
      for (let i = 0; i < sig.length; i += BLOCK) at.process(sig.subarray(i, i + BLOCK), out, new Float32Array(BLOCK), { retuneMs: 0, mix: 1 });
      expect(Math.abs(centsBetween(at.status.freq, freq))).toBeLessThan(5);
    }
  });

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
      at.process(input.subarray(i, i + BLOCK), out.subarray(i, i + BLOCK), new Float32Array(BLOCK), { retuneMs: 0, mix: 0 });
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

describe('voices and reverb', () => {
  const quiet = (x) => Float32Array.from(x, (v) => v * 0.5);

  it('leaves single-voice styles identical in both channels', () => {
    const { out, right } = run(sawtooth(450, SR, SR / 2), { scale: 'chromatic' });
    expect(right).toEqual(out);
  });

  it('adds a harmony a diatonic third above the target', () => {
    // Sing E4 (64) in C major; a diatonic third above is G4 (67). The harmony
    // is panned hard right, so right − left isolates it.
    const sung = midiToFreq(64);
    const { out, right } = run(quiet(sawtooth(sung, SR, SR)), {
      scale: 'major',
      key: 0,
      harmonies: [{ steps: 2, gain: 1, pan: 1 }],
    });
    // Right = lead + harmony, left = lead only → right − left = harmony.
    const harmony = Float32Array.from(right, (v, i) => v - out[i]);
    expect(Math.abs(centsBetween(pitchAt(harmony, SR / 2), midiToFreq(67)))).toBeLessThan(10);
  });

  it('adds a fifth above, following retune and key', () => {
    const sung = midiToFreq(62.3); // D4 + 30 cents in D major → lead D4, fifth A4
    const { out, right } = run(quiet(sawtooth(sung, SR, SR)), {
      scale: 'major',
      key: 2,
      harmonies: [{ steps: 4, gain: 1, pan: 1 }],
    });
    const harmony = Float32Array.from(right, (v, i) => v - out[i]);
    expect(Math.abs(centsBetween(pitchAt(harmony, SR / 2), midiToFreq(69)))).toBeLessThan(10);
  });

  it('doubles sit slightly detuned and late, panned to the sides', () => {
    const { out, right } = run(quiet(sawtooth(220, SR, SR)), {
      scale: 'chromatic',
      doubles: { count: 2, detuneCents: 9, delayMs: [17, 26], gain: 0.8, pan: 0.7 },
    });
    // Wide: left and right differ, but both stay close to the lead's pitch.
    let diff = 0;
    for (let i = SR / 2; i < SR; i++) diff = Math.max(diff, Math.abs(out[i] - right[i]));
    expect(diff).toBeGreaterThan(0.01);
    for (const ch of [out, right]) expect(Math.abs(centsBetween(pitchAt(ch, SR / 2), 220))).toBeLessThan(15);
  });

  it('voices fade out with the voicing (no doubled breaths)', () => {
    const input = noise(SR, 0.3);
    const { out, right } = run(input, {
      harmonies: [{ steps: 2, gain: 1, pan: 1 }],
      doubles: { count: 2, detuneCents: 9, delayMs: [17, 26], gain: 1, pan: 1 },
    });
    // Unvoiced → only the centred dry lead (scaled by the headroom), no extra voices.
    for (let i = SR / 2; i < SR; i++) expect(right[i]).toBeCloseTo(out[i], 6);
  });

  it('reverb leaves a tail after the voice stops', () => {
    const input = new Float32Array(SR);
    input.set(quiet(sawtooth(220, SR, SR / 2)));
    const dryRun = run(input, { scale: 'chromatic' }).out;
    const wetRun = run(input, { scale: 'chromatic', reverb: { mix: 0.3, size: 0.7 } }).out;
    const rms = (x, a, b) => Math.sqrt(x.subarray(a, b).reduce((s, v) => s + v * v, 0) / (b - a));
    const tail = [Math.round(0.6 * SR), Math.round(0.8 * SR)];
    expect(rms(dryRun, ...tail)).toBeLessThan(1e-4);
    expect(rms(wetRun, ...tail)).toBeGreaterThan(1e-3);
  });

  it('keeps the full popgroup mix finite and within ±1', () => {
    const { out, right } = run(sawtooth(330, SR, SR, 0.9), {
      scale: 'major',
      formantShift: 1.08,
      harmonies: [{ steps: 2, gain: 0.45, pan: -0.35 }, { steps: 4, gain: 0.35, pan: 0.35 }],
      doubles: { count: 2, detuneCents: 9, delayMs: [17, 26], gain: 0.5, pan: 0.7 },
      reverb: { mix: 0.22, size: 0.7 },
    });
    for (const ch of [out, right]) expect(ch.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
  });
});

describe('softLimit', () => {
  it('is transparent below 0.9 and never exceeds 1', () => {
    expect(softLimit(0.5)).toBe(0.5);
    expect(softLimit(-0.9)).toBe(-0.9);
    expect(softLimit(1.2)).toBeLessThanOrEqual(1);
    expect(softLimit(-50)).toBeGreaterThanOrEqual(-1);
    expect(softLimit(0.95)).toBeGreaterThan(softLimit(0.92));
  });
});
