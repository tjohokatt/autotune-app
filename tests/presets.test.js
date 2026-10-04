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
  });
});
