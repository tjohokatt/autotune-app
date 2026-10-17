// Loudness for recorded audio. Phone mics (iPhone especially) are quiet once
// the browser's auto gain control is off, which we need for pitch detection,
// and a karaoke backing track is mastered loud.
//
// Autotune takes: the voice and the backing track are recorded on separate
// channels and mixed at the end (mixTake):
//   1. The voice is brought up until its singing level (see levelOf) reaches
//      VOICE_LEVEL, at most MAX_GAIN times so a near-silent take doesn't turn
//      into loud hiss. A level, not the peak: one pop or clap would otherwise
//      keep the whole take quiet.
//   2. The backing track is turned down, if needed, to BACKING_BELOW under the
//      voice, so the singer stays on top.
//   3. The sum goes through a soft limiter: everything below LIMIT_FROM passes
//      unchanged, louder peaks bend smoothly towards ±1 instead of clipping.
//
// Short dialect clips use plain peak normalization (normalizeGain).

export const TARGET_PEAK = 0.89; // ≈ −1 dBFS
export const VOICE_LEVEL = 0.2; // ≈ −14 dBFS RMS while singing
export const MAX_GAIN = 30; // ≈ +30 dB
export const BACKING_BELOW = 0.5; // backing level at most half the voice level (−6 dB)
export const LIMIT_FROM = 0.7;

const WINDOW = 1024; // ≈ 21 ms at 48 kHz
const SILENCE = 1e-4; // windows quieter than this (−80 dBFS) are ignored
const PERCENTILE = 0.9;

/** Gain that brings the peak to TARGET_PEAK (never below 1, at most MAX_GAIN). */
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

/**
 * Singing level of a signal: the RMS of its louder windows (90th percentile
 * of the non-silent 1024-sample windows). 0 for silence.
 */
export function levelOf(chunks) {
  const rms = [];
  let sum = 0;
  let n = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i] * chunk[i];
      if (++n === WINDOW) {
        rms.push(Math.sqrt(sum / WINDOW));
        sum = 0;
        n = 0;
      }
    }
  }
  if (n > WINDOW / 4) rms.push(Math.sqrt(sum / n));
  const active = rms.filter((r) => r > SILENCE).sort((a, b) => a - b);
  if (!active.length) return 0;
  return active[Math.min(active.length - 1, Math.floor(active.length * PERCENTILE))];
}

/** Gain that brings a voice at `level` to VOICE_LEVEL (never below 1). */
export function voiceGain(level) {
  if (level === 0) return 1;
  return Math.min(MAX_GAIN, Math.max(1, VOICE_LEVEL / level));
}

/** Soft limiter for one sample: linear up to LIMIT_FROM, then tanh towards ±1. */
export function limit(x) {
  const a = Math.abs(x);
  if (a <= LIMIT_FROM) return x;
  const room = 1 - LIMIT_FROM;
  return Math.sign(x) * (LIMIT_FROM + room * Math.tanh((a - LIMIT_FROM) / room));
}

/**
 * Mix a take. `voice` and `backing` are chunk arrays of matching lengths
 * (backing is silent or empty when no song played). Returns new mono chunks.
 */
export function mixTake(voice, backing = []) {
  const vLevel = levelOf(voice);
  const vGain = voiceGain(vLevel);
  const bLevel = levelOf(backing);
  // Compare against the voice after its gain; a silent voice counts as VOICE_LEVEL.
  const voiceOut = vLevel ? vLevel * vGain : VOICE_LEVEL;
  const bGain = bLevel ? Math.min(1, (BACKING_BELOW * voiceOut) / bLevel) : 0;
  return voice.map((chunk, c) => {
    const b = backing[c];
    const out = new Float32Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) out[i] = limit(chunk[i] * vGain + (b ? b[i] * bGain : 0));
    return out;
  });
}
