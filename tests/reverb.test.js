import { describe, it, expect } from 'vitest';
import { createReverb } from '../src/dsp/reverb.js';
import { panGains } from '../src/dsp/voices.js';

const SR = 48000;

function impulseResponse(size, seconds = 3) {
  const rev = createReverb(SR);
  rev.setSize(size);
  const n = SR * seconds;
  const input = new Float32Array(n);
  input[0] = 1;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i += 128) rev.process(input.subarray(i, i + 128), L.subarray(i, i + 128), R.subarray(i, i + 128));
  return { L, R, rev };
}

const energy = (x, a, b) => x.subarray(a, b).reduce((s, v) => s + v * v, 0);

describe('reverb', () => {
  it('produces a decaying tail', () => {
    const { L } = impulseResponse(0.7);
    const early = energy(L, 0, SR / 2);
    const late = energy(L, (5 * SR) / 2, 3 * SR);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(early * 0.01);
  });

  it('a bigger room rings longer', () => {
    const tail = (size) => energy(impulseResponse(size).L, SR, 2 * SR);
    expect(tail(0.9)).toBeGreaterThan(tail(0.3) * 5);
  });

  it('is wide: left and right differ', () => {
    const { L, R } = impulseResponse(0.7, 1);
    let diff = 0;
    for (let i = 0; i < SR; i++) diff += Math.abs(L[i] - R[i]);
    expect(diff).toBeGreaterThan(0.1);
  });

  it('stays stable at maximum size and clears to silence', () => {
    const { L, R, rev } = impulseResponse(1, 3);
    expect(L.every(Number.isFinite) && R.every(Number.isFinite)).toBe(true);
    expect(L.reduce((m, v) => Math.max(m, Math.abs(v)), 0)).toBeLessThan(1);
    rev.clear();
    const out = new Float32Array(128);
    rev.process(new Float32Array(128), out, new Float32Array(128));
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

describe('panGains', () => {
  it('keeps the centre at full level in both channels', () => {
    expect(panGains(0)).toEqual([1, 1]);
    expect(panGains(-1)).toEqual([1, 0]);
    expect(panGains(0.5)).toEqual([0.5, 1]);
  });
});
