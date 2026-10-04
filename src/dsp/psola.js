// Streaming TD-PSOLA pitch shifter (Time-Domain Pitch-Synchronous Overlap-Add).
//
// Idea: a voiced sound is a train of pulses, one per pitch period T. Cut the
// input into "grains" up to two periods long (Hann-windowed, centred one
// period apart) and paste them back with a *different* spacing:
//
//   input   ⌒⌒⌒⌒⌒⌒   grains every T            → pitch = 1/T
//   output  ⌒⌒⌒⌒⌒⌒⌒⌒ grains every T / ratio    → pitch = ratio/T
//
// Each grain keeps its own shape, so the vocal-tract resonances (formants)
// stay put and the voice still sounds like the same person, only at another
// pitch. To move the formants too (chipmunk/monster), each grain is resampled
// by `formant` when it is pasted. That squeezes or stretches its spectrum.
//
// Timeline: output sample n corresponds to input sample n − latency. A grain
// centred at output time s is cut around input time ≈ s − latency, and it is
// pasted just before the output reaches it, i.e. up to one (pasted) half-width
// ahead. It also needs input up to one half-width past its centre, so
// latency ≈ 2·maxPeriod covers normal cases. In the rare corner cases where
// that input hasn't arrived yet (very low voices with formant < 1, or the
// nearest mark lying just ahead), the grain is shortened instead of adding
// latency.

/** Latency in samples for a given sample rate and lowest shifted frequency. */
export function psolaLatency(sampleRate, minFreq) {
  return 2 * Math.ceil(sampleRate / minFreq) + 2;
}

/**
 * @param {number} sampleRate
 * @param {object} [opts]
 * @param {number} [opts.minFreq=75]  lowest pitch that gets shifted (sets the latency)
 */
export function createPsola(sampleRate, { minFreq = 75 } = {}) {
  const maxPeriod = Math.ceil(sampleRate / minFreq);
  const latency = psolaLatency(sampleRate, minFreq);
  // Grain spacing used for unvoiced input, where there is no real period.
  // With ratio 1 the overlap-add then reconstructs the input.
  const unvoicedPeriod = Math.min(maxPeriod, Math.round(sampleRate * 0.01));

  // Ring buffers indexed by absolute sample position & mask.
  let size = 1;
  while (size < latency + 6 * maxPeriod + 1024) size *= 2;
  const mask = size - 1;
  const input = new Float32Array(size);
  const ola = new Float32Array(size); // overlap-add accumulator (output timeline)

  let inPos = 0; // number of input samples written so far
  let synthMark = 0; // centre of the next output grain (output timeline)
  let anaMark = -Infinity; // current analysis mark (input timeline), on a grid of period T

  /** Linear interpolation into the input ring. */
  function readInput(x) {
    const i = Math.floor(x);
    const frac = x - i;
    return input[i & mask] * (1 - frac) + input[(i + 1) & mask] * frac;
  }

  /**
   * Paste one grain cut around input position `a` (half-width T) at output
   * position `s`, resampled by `formant`. Samples before `emitted` are already
   * gone, so they are skipped.
   */
  function placeGrain(a, s, T, formant, gain, emitted) {
    // Don't read input that hasn't arrived yet (only matters for very low
    // voices combined with formant < 1). Shrink the grain instead.
    const Ta = Math.min(T, inPos - 2 - a);
    if (Ta < 2) return;
    const Tg = Ta / formant; // half-width of the pasted grain
    const start = Math.max(Math.ceil(s - Tg), emitted);
    const end = Math.floor(s + Tg);
    for (let p = start; p <= end; p++) {
      const u = (p - s) / Tg; // −1 … 1 across the grain
      const w = 0.5 + 0.5 * Math.cos(Math.PI * u); // Hann window
      ola[p & mask] += gain * w * readInput(a + (p - s) * formant);
    }
  }

  return {
    latency,

    /**
     * Process one block.
     * @param {Float32Array} block    input samples
     * @param {Float32Array} wetOut   pitch-shifted output (delayed by `latency`)
     * @param {Float32Array} dryOut   input delayed by `latency`, for crossfading
     * @param {object} p
     * @param {number} p.period   input pitch period in samples, or 0 if unvoiced
     * @param {number} p.ratio    output/input pitch ratio (2 = one octave up)
     * @param {number} p.formant  formant scale factor (1 = unchanged)
     */
    process(block, wetOut, dryOut, { period, ratio, formant }) {
      const n = block.length;
      const emitted = inPos; // first output position of this block
      for (let i = 0; i < n; i++) input[(inPos + i) & mask] = block[i];
      inPos += n;

      const voiced = period > 0 && period <= maxPeriod;
      const T = voiced ? period : unvoicedPeriod;
      const r = voiced ? ratio : 1;
      const f = voiced ? formant : 1;
      const hop = T / r; // output grain spacing → new pitch

      // Grain half-width in the input: one period, but once pasted (÷ f) no
      // wider than one *output* period. Classic 2T grains overlap 2·ratio
      // times going up and cancel each other on smooth (sine-like) voices, so
      // whistling an octave up would come out nearly silent.
      const half = Math.min(T, hop * f);

      // Hann windows of pasted half-width `half / f`, spaced `hop` apart, sum
      // to `overlap` ≤ 1 (exactly 1 when shifting up). When shifting down the
      // grains leave gaps (that's how PSOLA lowers a voice). A moderate
      // power-based boost keeps it from sounding much quieter.
      const overlap = half / f / hop;
      const gain = Math.min(1.5, 1 / Math.sqrt(overlap));

      // Paste every grain that reaches into this block's output range.
      while (synthMark - half / f < inPos) {
        const target = synthMark - latency;
        // Re-sync the analysis grid after silence or big jumps.
        if (target - anaMark > 4 * maxPeriod) anaMark = target;
        // Analysis mark nearest to the target. Marks are one period apart, so
        // consecutive grains come from matching points in the waveform. With
        // ratio 1 the mark lands on the target, so wet lines up with dry.
        while (anaMark + T / 2 <= target) anaMark += T;
        placeGrain(anaMark, synthMark, half, f, gain, emitted);
        synthMark += hop;
      }

      // Emit this block and clear those slots for reuse.
      for (let i = 0; i < n; i++) {
        const p = (emitted + i) & mask;
        wetOut[i] = ola[p];
        ola[p] = 0;
        dryOut[i] = input[(emitted + i - latency) & mask];
      }
    },
  };
}
