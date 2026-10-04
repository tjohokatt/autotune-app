import { describe, it, expect } from 'vitest';
import { SCALES, inScale, snapToScale, chooseTarget } from '../src/dsp/scales.js';

const C = 0;
const D = 2;

describe('scales', () => {
  it('knows C major', () => {
    expect([60, 62, 64, 65, 67, 69, 71].every((n) => inScale(n, C, 'major'))).toBe(true);
    expect([61, 63, 66, 68, 70].some((n) => inScale(n, C, 'major'))).toBe(false);
  });

  it('transposes scales by key', () => {
    expect(inScale(66, D, 'major')).toBe(true); // F# is in D major
    expect(inScale(65, D, 'major')).toBe(false); // F is not
  });

  it('chromatic snaps to the nearest semitone', () => {
    expect(snapToScale(69.4, C, 'chromatic')).toBe(69);
    expect(snapToScale(69.6, C, 'chromatic')).toBe(70);
  });

  it('major snaps out-of-scale pitches to the nearest scale note', () => {
    expect(snapToScale(60.6, C, 'major')).toBe(60); // C+60 → C (0.6 away) beats D (1.4 away)
    expect(snapToScale(61.7, C, 'major')).toBe(62); // → D
    expect(snapToScale(70.4, C, 'major')).toBe(71); // A#+40 → B (0.6 away) beats A (1.4 away)
  });

  it('pentatonic jumps over gaps', () => {
    expect(snapToScale(65, C, 'pentatonic')).toBe(64); // F → E (1 away; G is 2 away)
    expect(snapToScale(66, C, 'pentatonic')).toBe(67); // F# → G
  });

  it('every scale snaps every pitch to a note in the scale', () => {
    for (const scale of Object.keys(SCALES)) {
      for (let key = 0; key < 12; key++) {
        for (let m = 40; m < 90; m += 0.37) {
          const t = snapToScale(m, key, scale);
          expect(inScale(t, key, scale)).toBe(true);
          expect(Math.abs(t - m)).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('chooseTarget holds the previous note near the boundary (hysteresis)', () => {
    expect(chooseTarget(69.6, 69, C, 'chromatic')).toBe(69); // only 0.2 closer to 70
    expect(chooseTarget(69.7, 69, C, 'chromatic')).toBe(70); // 0.4 closer → switch
    expect(chooseTarget(69.6, null, C, 'chromatic')).toBe(70);
  });

  it('chooseTarget drops a previous note that left the scale', () => {
    expect(chooseTarget(61.4, 61, C, 'major')).toBe(62);
  });
});
