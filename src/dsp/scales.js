// Musical scales and "snap to the nearest allowed note".
// Notes are MIDI numbers (fractional while singing, integer for targets).

/** Semitone offsets from the key's root. */
export const SCALES = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
};

/** True if integer MIDI note `n` belongs to `scale` in `key` (0 = C … 11 = B). */
export function inScale(n, key, scale) {
  const pitchClass = (((n - key) % 12) + 12) % 12;
  return SCALES[scale].includes(pitchClass);
}

/** Nearest integer MIDI note in the scale. Ties go to the lower note. */
export function snapToScale(midi, key, scale) {
  const base = Math.round(midi);
  // Every scale has a note within 6 semitones, so search outwards from `base`.
  let best = null;
  for (let d = 0; d <= 6; d++) {
    for (const n of d === 0 ? [base] : [base - d, base + d]) {
      if (inScale(n, key, scale) && (best === null || Math.abs(n - midi) < Math.abs(best - midi))) best = n;
    }
    if (best !== null && Math.abs(best - midi) <= d) break;
  }
  return best;
}

/**
 * Like snapToScale, but sticks with the previous target unless the new one is
 * clearly closer. Without this, a voice hovering right between two notes makes
 * the target flip back and forth and the output warbles.
 *
 * @param {number} hysteresis  semitones the new note must win by (0.3 = 30 cents)
 */
export function chooseTarget(midi, prevTarget, key, scale, hysteresis = 0.3) {
  const candidate = snapToScale(midi, key, scale);
  if (
    prevTarget != null &&
    candidate !== prevTarget &&
    inScale(prevTarget, key, scale) &&
    Math.abs(midi - prevTarget) < Math.abs(midi - candidate) + hysteresis
  ) {
    return prevTarget;
  }
  return candidate;
}

/**
 * The note `steps` scale degrees above integer MIDI note `note` (negative =
 * below). Harmonies use this so a "third" (2 steps) or "fifth" (4 steps)
 * stays in the key, becoming a major or minor third depending on where in
 * the scale you are, like a hardware harmonizer.
 *
 * In the chromatic scale every semitone is a "step", which would make a
 * third only 2 semitones. Harmonies then use the major scale of the key.
 */
export function scaleStep(note, steps, key, scale) {
  const s = scale === 'chromatic' ? 'major' : scale;
  const dir = Math.sign(steps);
  let n = note;
  for (let left = Math.abs(steps); left > 0; ) {
    n += dir;
    if (inScale(n, key, s)) left--;
  }
  return n;
}
