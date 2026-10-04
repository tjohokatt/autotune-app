// Retune smoothing: how fast the voice is pulled to the target note.
//
// We smooth the *correction* (target − sung pitch, in semitones), not the
// pitch itself. A slow retune then only removes slow, steady offsets, while
// fast wiggles like vibrato pass through. That's what makes "natural" sound
// natural. With retuneMs = 0 the correction is applied instantly every
// analysis frame, giving the hard, stepped "robot" effect.
//
// Smoothing is a one-pole low-pass filter with time constant τ = retuneMs:
//   c ← c + (wanted − c) · (1 − e^(−dt/τ))
// After τ the correction has covered ~63% of the way, after 3τ ~95%.

export function createRetuner() {
  let correction = 0;

  return {
    /**
     * @param {object} p
     * @param {number|null} p.midi   sung pitch (fractional MIDI), null when unvoiced
     * @param {number} p.target      target note (integer MIDI)
     * @param {number} p.retuneMs    smoothing time constant in ms (0 = instant)
     * @param {number} p.humanize    0…1, fraction of the correction left out
     * @param {number} p.dt          seconds since the previous update
     * @returns {number} correction in semitones
     */
    update({ midi, target, retuneMs, humanize = 0, dt }) {
      if (midi == null) {
        // Start every new phrase from "no correction", so a slow retune
        // scoops into the note instead of jumping.
        correction = 0;
        return 0;
      }
      const wanted = (target - midi) * (1 - humanize);
      if (retuneMs <= 0) {
        correction = wanted;
      } else {
        correction += (wanted - correction) * (1 - Math.exp(-(dt * 1000) / retuneMs));
      }
      return correction;
    },
    reset() {
      correction = 0;
    },
  };
}
