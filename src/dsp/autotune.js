// The full autotune chain for one mono input → stereo output, as a plain
// object so it can be tested outside the AudioWorklet:
//
//   input ─┬─ ↓2 → YIN (every hop) → sung note → target note → retune smoothing → ratio
//          ├─ PSOLA(ratio, formant) ──┐
//          │         dry (delayed) ───┴─ crossfade by voicing × mix → lead (centre)
//          ├─ voices: doubles + harmonies (own PSOLA each, delayed, panned) ─┐
//          │                                                                 Σ → L/R
//          └──────────────────────────── reverb (stereo, from the L/R mix) ──┘ → soft limiter
//
// When YIN finds no clear pitch (breaths, consonants, silence), the lead
// crossfades to the dry signal, delayed by the same latency so nothing jumps,
// and the extra voices fade out. Doubled or harmonized consonants sound smeared.
//
// YIN runs on a 2× decimated copy of the input. Its cost grows with
// window × max lag, so halving the rate makes it ~4× cheaper. That matters
// because one analysis has to fit inside a single 128-sample render quantum
// (2.7 ms) on a phone. Voice pitch (≤ 1.1 kHz) is far below the new Nyquist
// frequency.

import { createYin } from './yin.js';
import { createPsola } from './psola.js';
import { createRetuner } from './retune.js';
import { chooseTarget, scaleStep } from './scales.js';
import { freqToMidi } from './notes.js';
import { createVoice } from './voices.js';
import { createReverb } from './reverb.js';

const VOICING_FADE_S = 0.01; // 10 ms crossfade between wet and dry
const MAX_VOICES = 6;

export const DEFAULT_OPTIONS = {
  key: 0, // C
  scale: 'chromatic',
  transpose: 0, // semitones
  formantShift: 1,
  humanize: 0,
  harmonies: [], // [{ steps, gain, pan }]
  doubles: null, // { count, detuneCents, delayMs: [..], gain, pan }
  reverb: null, // { mix, size }
};

/**
 * Soft safety limiter: transparent below 0.9, then bends smoothly towards 1.
 * Several voices plus reverb can add up above full scale; hard clipping would
 * crackle.
 */
export function softLimit(x) {
  const a = Math.abs(x);
  if (a <= 0.9) return x;
  return Math.sign(x) * (0.9 + 0.1 * Math.tanh((a - 0.9) / 0.1));
}

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

  // Extra voices and reverb are preallocated; presets only switch them on.
  const voicePool = Array.from({ length: MAX_VOICES }, () => createVoice(sampleRate, { minFreq }));
  let voices = []; // active subset of voicePool
  const reverb = createReverb(sampleRate);
  let reverbMix = 0;
  let headroom = 1;

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
  let wet, dry, fade, revIn, revL, revR;
  function ensureScratch(n) {
    if (wet && wet.length >= n) return;
    [wet, dry, fade, revIn, revL, revR] = Array.from({ length: 6 }, () => new Float32Array(n));
  }
  ensureScratch(128);

  // Latest analysis result.
  const status = { freq: null, confidence: 0, targetMidi: null };
  let target = null; // target note before transpose
  let ratio = 1;
  let voicedGain = 0; // 0 = dry … 1 = wet
  const fadeStep = 1 / (VOICING_FADE_S * sampleRate);
  const voiceParams = { period: 0, ratio: 1, formant: 1 };

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

  /** Map the preset's harmonies/doubles onto the voice pool. */
  function configureVoices() {
    const specs = [];
    for (const h of options.harmonies ?? []) specs.push({ steps: h.steps, gain: h.gain, pan: h.pan ?? 0 });
    const d = options.doubles;
    for (let i = 0; i < (d?.count ?? 0); i++) {
      const side = i % 2 === 0 ? -1 : 1; // alternate left/right and sharp/flat
      specs.push({
        steps: 0,
        gain: d.gain,
        pan: side * (d.pan ?? 0),
        delayMs: d.delayMs[i % d.delayMs.length],
        detuneCents: -side * d.detuneCents,
        driftPhase: i * 2.1,
      });
    }
    voices = specs.slice(0, MAX_VOICES).map((spec, i) => {
      voicePool[i].configure(spec);
      return voicePool[i];
    });
    // Keep the overall level roughly constant: voices add up in power.
    headroom = 1 / Math.sqrt(1 + voices.reduce((s, v, i) => s + specs[i].gain ** 2, 0));
  }

  return {
    latency: psola.latency,
    status,

    /** Discrete settings: key, scale, transpose, formantShift, humanize, harmonies, doubles, reverb. */
    setOptions(next) {
      Object.assign(options, next);
      target = null; // the old target may not be in the new scale
      if ('harmonies' in next || 'doubles' in next) configureVoices();
      if ('reverb' in next) {
        const r = options.reverb;
        if (!r?.mix) reverb.clear(); // don't resume an old tail later
        reverbMix = r?.mix ?? 0;
        if (r) reverb.setSize(r.size ?? 0.5);
      }
    },

    /**
     * @param {Float32Array} input
     * @param {Float32Array} outL     same length as input
     * @param {Float32Array} outR     same length as input
     * @param {{ retuneMs: number, mix: number }} params
     */
    process(input, outL, outR, { retuneMs, mix }) {
      const n = input.length;
      ensureScratch(n);

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
      voiceParams.period = voiced ? sampleRate / status.freq : 0;
      voiceParams.ratio = ratio;
      voiceParams.formant = options.formantShift;
      psola.process(input, wet, dry, voiceParams);

      // Lead, centred.
      const goal = voiced ? 1 : 0;
      for (let i = 0; i < n; i++) {
        if (voicedGain < goal) voicedGain = Math.min(goal, voicedGain + fadeStep);
        else if (voicedGain > goal) voicedGain = Math.max(goal, voicedGain - fadeStep);
        const amount = voicedGain * mix;
        fade[i] = amount * headroom;
        const lead = (dry[i] + (wet[i] - dry[i]) * amount) * headroom;
        outL[i] = lead;
        outR[i] = lead;
      }

      // Doubles and harmonies, faded in with the voicing.
      for (const v of voices) {
        let r = ratio;
        if (v.steps !== 0 && target != null) {
          const note = scaleStep(target, v.steps, options.key, options.scale);
          r = ratio * 2 ** ((note - target) / 12);
        }
        voiceParams.ratio = r;
        v.process(input, outL, outR, voiceParams, fade);
      }

      // Reverb on the mix (mono sum in, stereo out).
      if (reverbMix > 0) {
        for (let i = 0; i < n; i++) revIn[i] = 0.5 * (outL[i] + outR[i]);
        reverb.process(revIn, revL, revR, n);
        for (let i = 0; i < n; i++) {
          outL[i] += revL[i] * reverbMix;
          outR[i] += revR[i] * reverbMix;
        }
      }

      for (let i = 0; i < n; i++) {
        outL[i] = softLimit(outL[i]);
        outR[i] = softLimit(outR[i]);
      }
    },
  };
}
