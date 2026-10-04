// Frequency ↔ note helpers (12-tone equal temperament, A4 = 440 Hz = MIDI 69).

// International note names. Swedish convention would use "H" for B.
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Fractional MIDI note number: each semitone is a factor of 2^(1/12). */
export function freqToMidi(freq, a4 = 440) {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** "A4", "C#5", … for an integer MIDI note (MIDI 60 = C4). */
export function noteName(midi) {
  const n = Math.round(midi);
  const octave = Math.floor(n / 12) - 1;
  return NOTE_NAMES[((n % 12) + 12) % 12] + octave;
}

/**
 * Nearest note and how far off it is, in cents (1/100 semitone, −50…+50).
 * @returns {{ midi: number, name: string, cents: number }}
 */
export function describePitch(freq, a4 = 440) {
  const exact = freqToMidi(freq, a4);
  const midi = Math.round(exact);
  return { midi, name: noteName(midi), cents: (exact - midi) * 100 };
}
