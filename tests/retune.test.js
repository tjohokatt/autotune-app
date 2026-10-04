import { describe, it, expect } from 'vitest';
import { createRetuner } from '../src/dsp/retune.js';

const dt = 0.01; // 10 ms per update

describe('retuner', () => {
  it('applies the full correction instantly with retuneMs = 0', () => {
    const r = createRetuner();
    expect(r.update({ midi: 69.3, target: 69, retuneMs: 0, dt })).toBeCloseTo(-0.3);
  });

  it('glides with time constant retuneMs (63% after τ)', () => {
    const r = createRetuner();
    let c = 0;
    for (let t = 0; t < 10; t++) c = r.update({ midi: 70, target: 69, retuneMs: 100, dt }); // 100 ms
    expect(c).toBeCloseTo(-(1 - Math.exp(-1)), 5);
  });

  it('humanize leaves part of the deviation in', () => {
    const r = createRetuner();
    expect(r.update({ midi: 69.4, target: 69, retuneMs: 0, humanize: 0.25, dt })).toBeCloseTo(-0.3);
  });

  it('resets when the voice stops, so the next note scoops in again', () => {
    const r = createRetuner();
    for (let t = 0; t < 50; t++) r.update({ midi: 70, target: 69, retuneMs: 50, dt });
    expect(r.update({ midi: null })).toBe(0);
    const first = r.update({ midi: 70, target: 69, retuneMs: 50, dt });
    expect(Math.abs(first)).toBeLessThan(0.25);
  });
});
