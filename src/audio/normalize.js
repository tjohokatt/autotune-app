// Peak normalization for recorded takes. Phone mics (iPhone especially) are
// quiet once the browser's auto gain control is off, which we need for pitch
// detection. So a finished take is scaled up until its loudest sample hits
// TARGET_PEAK, at most MAX_GAIN times so a near-silent take doesn't turn into
// loud hiss.

export const TARGET_PEAK = 0.89; // ≈ −1 dBFS
export const MAX_GAIN = 20; // +26 dB

/** Gain that brings the take's peak to TARGET_PEAK (never below 1). */
export function normalizeGain(chunks, targetPeak = TARGET_PEAK, maxGain = MAX_GAIN) {
  let peak = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const a = Math.abs(chunk[i]);
      if (a > peak) peak = a;
    }
  }
  if (peak === 0) return 1;
  return Math.min(maxGain, Math.max(1, targetPeak / peak));
}

/** Scale all chunks in place. */
export function applyGain(chunks, gain) {
  if (gain === 1) return;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) chunk[i] *= gain;
  }
}
