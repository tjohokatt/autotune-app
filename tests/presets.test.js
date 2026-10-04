import { describe, it, expect } from 'vitest';
import { PRESETS, DEFAULT_PRESET_ID, getPreset } from '../src/presets.js';
import { SCALES } from '../src/dsp/scales.js';

describe('presets', () => {
  it('has unique ids and a valid default', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_PRESET_ID);
    expect(getPreset('nope').id).toBe(DEFAULT_PRESET_ID);
  });

  it.each(PRESETS.map((p) => [p.id, p]))('%s has sane values', (_, p) => {
    expect(p.name).toBeTruthy();
    expect(p.emoji).toBeTruthy();
    expect(Object.keys(SCALES)).toContain(p.scale);
    expect(p.retuneMs).toBeGreaterThanOrEqual(0);
    expect(p.humanize).toBeGreaterThanOrEqual(0);
    expect(p.humanize).toBeLessThanOrEqual(1);
    expect(Number.isInteger(p.transpose)).toBe(true);
    expect(p.formantShift).toBeGreaterThan(0.5);
    expect(p.formantShift).toBeLessThan(2);
    expect(p.mix).toBeGreaterThanOrEqual(0);
    expect(p.mix).toBeLessThanOrEqual(1);

    expect(Array.isArray(p.harmonies)).toBe(true);
    for (const h of p.harmonies) {
      expect(Number.isInteger(h.steps) && h.steps !== 0).toBe(true);
      expect(h.gain).toBeGreaterThan(0);
      expect(Math.abs(h.pan)).toBeLessThanOrEqual(1);
    }
    if (p.doubles) {
      expect(p.doubles.count).toBeGreaterThan(0);
      expect(p.doubles.delayMs.every((ms) => ms >= 0 && ms <= 50)).toBe(true);
      expect(Math.abs(p.doubles.pan)).toBeLessThanOrEqual(1);
    }
    // Total voices must fit the preallocated pool in dsp/autotune.js.
    expect(p.harmonies.length + (p.doubles?.count ?? 0)).toBeLessThanOrEqual(6);
    if (p.reverb) {
      expect(p.reverb.mix).toBeGreaterThan(0);
      expect(p.reverb.mix).toBeLessThanOrEqual(1);
      expect(p.reverb.size).toBeGreaterThanOrEqual(0);
      expect(p.reverb.size).toBeLessThanOrEqual(1);
    }
  });
});
