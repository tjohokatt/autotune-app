// The full autotune chain for one mono stream, as a plain object so it can be
// tested outside the AudioWorklet:
//
//   input ─┬─ ↓2 → YIN (every hop) → sung note → target note → retune smoothing → ratio
//          └─ PSOLA(ratio, formant) ──┐
//                    dry (delayed) ───┴─ crossfade by voicing × mix → output
//
// When YIN finds no clear pitch (breaths, consonants, silence), the output
// crossfades to the dry signal, delayed by the same latency so nothing jumps.
//
// YIN runs on a 2× decimated copy of the input. Its cost grows with
// window × max lag, so halving the rate makes it ~4× cheaper. That matters
// because one analysis has to fit inside a single 128-sample render quantum
// (2.7 ms) on a phone. Voice pitch (≤ 1.1 kHz) is far below the new Nyquist
// frequency.

import { createYin } from './yin.js';
import { createPsola } from './psola.js';
import { createRetuner } from './retune.js';
import { chooseTarget } from './scales.js';
import { freqToMidi } from './notes.js';

const VOICING_FADE_S = 0.01; // 10 ms crossfade between wet and dry

export const DEFAULT_OPTIONS = {
  key: 0, // C
  scale: 'chromatic',
  transpose: 0, // semitones
  formantShift: 1,
  humanize: 0,
};

/**
 * @param {number} sampleRate
 * @param {object} [cfg]
 * @param {number} [cfg.bufferSize=2048]  YIN window, in full-rate samples
 * @param {number} [cfg.hopSize=512]      samples between pitch analyses
 * @param {number} [cfg.minFreq=75]       lowest pitch that is detected and shifted
 * @param {number} [cfg.maxFreq=1100]
 */
export function createAutotune(sampleRate, { bufferSize = 2048, hopSize = 512, minFreq = 75, maxFreq = 1100 } = {}) {
  const yinRate = sampleRate / 2;
  const yinSize = bufferSize / 2;
  const detect = createYin(yinRate, yinSize, { minFreq, maxFreq });
  const psola = createPsola(sampleRate, { minFreq });
  const retuner = createRetuner();
  const options = { ...DEFAULT_OPTIONS };

  // Decimated YIN input history (ring) and its unrolled copy.
  const ring = new Float32Array(yinSize);
  const analysis = new Float32Array(yinSize);
  let writePos = 0;
  // Decimator state: [1 2 1]/4 low-pass, keep every second output.
  let x1 = 0;
  let x2 = 0;
  let odd = false;
  let samplesSinceAnalysis = 0;

  // Scratch buffers, grown on demand (normally once, to 128).
  let wet = new Float32Array(128);
  let dry = new Float32Array(128);

  // Latest analysis result.
  const status = { freq: null, confidence: 0, targetMidi: null };
  let target = null; // target note before transpose
  let ratio = 1;
  let voicedGain = 0; // 0 = dry … 1 = wet
  const fadeStep = 1 / (VOICING_FADE_S * sampleRate);

  function analyse(retuneMs, dt) {
    const tail = yinSize - writePos;
    analysis.set(ring.subarray(writePos), 0);
    analysis.set(ring.subarray(0, writePos), tail);
    const { freq, confidence } = detect(analysis);
    status.freq = freq;
    status.confidence = confidence;

    if (freq == null) {
      target = null;
      ratio = 1;
      retuner.update({ midi: null });
      status.targetMidi = null;
      return;
    }
    const midi = freqToMidi(freq);
    target = chooseTarget(midi, target, options.key, options.scale);
    const correction = retuner.update({ midi, target, retuneMs, humanize: options.humanize, dt });
    ratio = 2 ** ((correction + options.transpose) / 12);
    status.targetMidi = target + options.transpose;
  }

  return {
    latency: psola.latency,
    status,

    /** Discrete settings (key, scale, transpose, formantShift, humanize). */
    setOptions(next) {
      Object.assign(options, next);
      target = null; // the old target may not be in the new scale
    },

    /**
     * @param {Float32Array} input
     * @param {Float32Array} output   same length as input
     * @param {{ retuneMs: number, mix: number }} params
     */
    process(input, output, { retuneMs, mix }) {
      const n = input.length;
      if (wet.length < n) {
        wet = new Float32Array(n);
        dry = new Float32Array(n);
      }

      for (let i = 0; i < n; i++) {
        const x = input[i];
        if (odd) {
          ring[writePos] = 0.25 * (x2 + 2 * x1 + x);
          writePos = (writePos + 1) % yinSize;
        }
        odd = !odd;
        x2 = x1;
        x1 = x;
      }
      samplesSinceAnalysis += n;
      if (samplesSinceAnalysis >= hopSize) {
        analyse(retuneMs, samplesSinceAnalysis / sampleRate);
        samplesSinceAnalysis = 0;
      }

      const voiced = status.freq != null;
      psola.process(input, wet, dry, {
        period: voiced ? sampleRate / status.freq : 0,
        ratio,
        formant: options.formantShift,
      });

      const goal = voiced ? 1 : 0;
      for (let i = 0; i < n; i++) {
        if (voicedGain < goal) voicedGain = Math.min(goal, voicedGain + fadeStep);
        else if (voicedGain > goal) voicedGain = Math.max(goal, voicedGain - fadeStep);
        const amount = voicedGain * mix;
        output[i] = dry[i] + (wet[i] - dry[i]) * amount;
      }
    },
  };
}
