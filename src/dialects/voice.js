// "Din röst på dialekt": keep the speaker's own voice and words, but give the
// recording a dialect's melody and tempo. Runs offline on a recorded clip
// (pure functions, no Web Audio), so it can be unit-tested.
//
// A dialect's `voice` settings:
//   melody   pitch curve over each phrase, in semitones (points spread evenly
//            from the start to the end of the phrase, linearly interpolated)
//   syllable pitch curve over each syllable, in semitones (same format); this
//            is the word melody that tells dialects apart the most
//   beat     semitones added per syllable, cycling (e.g. [2, -1] makes every
//            other syllable high, like a stressed/unstressed pattern)
//   flatten  how much of the speaker's own pitch movement is kept
//            (0 = monotone, 1 = unchanged, > 1 = more sing-song)
//   shift    overall pitch change in semitones
//   tempo    speaking rate (1 = unchanged, < 1 = slower)
//
// Steps:
//   1. YIN pitch track every HOP samples (MIDI per frame, or null).
//   2. Group voiced frames into phrases (pauses ≥ PAUSE_S split them), and
//      each phrase into syllables: voiced runs split by short unvoiced gaps
//      (consonants), a cheap stand-in for real syllable detection.
//   3. Per frame: target = median + (pitch − median)·flatten + melody(u)
//      + syllable(v) + beat[k] + shift, where u = 0…1 is the position inside
//      the phrase, v = 0…1 the position inside syllable number k.
//   4. TD-PSOLA moves each frame from its pitch to the target pitch, divided
//      by `tempo` (see 5).
//   5. Resampling by `tempo` changes the length and raises/lowers the pitch
//      by the same factor, which step 4 already compensated.

import { createYin } from '../dsp/yin.js';
import { createPsola } from '../dsp/psola.js';
import { freqToMidi } from '../dsp/notes.js';

const HOP = 256;
const PAUSE_S = 0.25;
const SYLLABLE_GAP_S = 0.01; // unvoiced gap that ends a syllable
const MIN_FREQ = 75;

/** Value of a curve given as evenly spaced points, at u in 0…1. */
export function curveAt(points, u) {
  if (!points?.length) return 0;
  if (points.length === 1) return points[0];
  const x = Math.min(1, Math.max(0, u)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(x));
  return points[i] + (points[i + 1] - points[i]) * (x - i);
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Pitch track: MIDI per HOP-sample frame, null where unvoiced. */
export function pitchTrack(samples, sampleRate, hop = HOP) {
  const size = 2 ** Math.ceil(Math.log2(sampleRate / MIN_FREQ) + 1); // ≥ 2 periods
  const detect = createYin(sampleRate, size, { minFreq: MIN_FREQ, maxFreq: 800 });
  const frames = Math.ceil(samples.length / hop);
  const track = new Array(frames).fill(null);
  const win = new Float32Array(size);
  for (let f = 0; f < frames; f++) {
    // Window centred on the frame.
    const start = f * hop + hop / 2 - size / 2;
    for (let i = 0; i < size; i++) win[i] = samples[start + i] ?? 0;
    const { freq } = detect(win);
    track[f] = freq == null ? null : freqToMidi(freq);
  }
  return track;
}

/** Group voiced frames into phrases: [{ start, end }] in frames (end exclusive). */
export function phrases(track, framesPerPause) {
  const out = [];
  let cur = null;
  let gap = 0;
  track.forEach((m, f) => {
    if (m == null) {
      gap++;
      if (cur && gap >= framesPerPause) {
        out.push(cur);
        cur = null;
      }
      return;
    }
    gap = 0;
    if (cur) cur.end = f + 1;
    else cur = { start: f, end: f + 1 };
  });
  if (cur) out.push(cur);
  return out;
}

/** Split frames start…end of a phrase into syllables (voiced runs). */
export function syllables(track, start, end, framesPerGap = 1) {
  return phrases(track.slice(start, end), framesPerGap).map((s) => ({ start: s.start + start, end: s.end + start }));
}

/** Per-frame pitch ratio (output/input) for a voice setting; 1 where unvoiced. */
export function targetRatios(track, voice, sampleRate, hop = HOP) {
  const { melody = [0], syllable = [0], beat = [0], flatten = 1, shift = 0, tempo = 1 } = voice;
  const ratios = new Array(track.length).fill(1);
  const gap = Math.max(1, Math.round((SYLLABLE_GAP_S * sampleRate) / hop));
  const position = (f, start, end) => (end - start > 1 ? (f - start) / (end - start - 1) : 0);
  for (const phrase of phrases(track, Math.round((PAUSE_S * sampleRate) / hop))) {
    const voiced = track.slice(phrase.start, phrase.end).filter((m) => m != null);
    const center = median(voiced);
    syllables(track, phrase.start, phrase.end, gap).forEach((syl, k) => {
      const word = beat[k % beat.length];
      for (let f = syl.start; f < syl.end; f++) {
        const m = track[f];
        if (m == null) continue;
        const target =
          center +
          (m - center) * flatten +
          curveAt(melody, position(f, phrase.start, phrase.end)) +
          curveAt(syllable, position(f, syl.start, syl.end)) +
          word +
          shift;
        // ÷ tempo: the final resampling multiplies the pitch by tempo again.
        ratios[f] = Math.min(2, Math.max(0.5, 2 ** ((target - m) / 12) / tempo));
      }
    });
  }
  return ratios;
}

/** Linear-interpolation resampling that plays `samples` `speed` times faster. */
export function changeSpeed(samples, speed) {
  if (speed === 1) return samples;
  const out = new Float32Array(Math.floor(samples.length / speed));
  for (let i = 0; i < out.length; i++) {
    const x = i * speed;
    const j = Math.floor(x);
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}

/**
 * Apply a dialect's voice settings to a mono recording.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @param {{ melody?: number[], flatten?: number, shift?: number, tempo?: number }} voice
 * @returns {Float32Array}
 */
export function dialectVoice(samples, sampleRate, voice) {
  const track = pitchTrack(samples, sampleRate);
  const ratios = targetRatios(track, voice, sampleRate);
  const psola = createPsola(sampleRate, { minFreq: MIN_FREQ });

  // Feed the clip plus `latency` samples of silence, then drop the first
  // `latency` output samples so the result lines up with the input.
  const total = samples.length + psola.latency;
  const shifted = new Float32Array(total);
  const block = new Float32Array(HOP);
  const wet = new Float32Array(HOP);
  const dry = new Float32Array(HOP);
  for (let pos = 0, f = 0; pos < total; pos += HOP, f++) {
    block.fill(0);
    block.set(samples.subarray(pos, Math.min(pos + HOP, samples.length)));
    const m = track[f];
    psola.process(block, wet, dry, {
      period: m == null ? 0 : sampleRate / (440 * 2 ** ((m - 69) / 12)),
      ratio: ratios[f] ?? 1,
      formant: 1,
    });
    shifted.set(wet.subarray(0, Math.min(HOP, total - pos)), pos);
  }
  return changeSpeed(shifted.subarray(psola.latency), voice.tempo ?? 1);
}
