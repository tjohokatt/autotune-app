// Extra voices on top of the lead: vocal doubles and harmonies.
//
// Each voice is its own PSOLA shifter fed with the same input and the same
// detected period as the lead, followed by a short delay line and a pan.
//
// - A *double* sings the same note as the lead, slightly detuned (a few
//   cents, drifting slowly) and a little late (15–30 ms). That's what it
//   sounds like when a singer records the same line several times.
// - A *harmony* sings a different note, a number of scale steps above or
//   below the lead's target, computed per analysis frame (see scaleStep).
//
// Voices are preallocated and reconfigured on preset changes, so nothing
// allocates on the audio thread.

import { createPsola } from './psola.js';

/** Linear "balance" pan with centre = full level in both channels. */
export function panGains(pan) {
  return [Math.min(1, 1 - pan), Math.min(1, 1 + pan)];
}

/**
 * @param {number} sampleRate
 * @param {object} [opts]
 * @param {number} [opts.minFreq=75]
 * @param {number} [opts.maxDelayMs=50]
 * @param {number} [opts.maxBlock=128]
 */
export function createVoice(sampleRate, { minFreq = 75, maxDelayMs = 50, maxBlock = 128 } = {}) {
  const psola = createPsola(sampleRate, { minFreq });
  const shifted = new Float32Array(maxBlock);
  const scratch = new Float32Array(maxBlock);

  const delayBuf = new Float32Array(Math.ceil((maxDelayMs / 1000) * sampleRate) + maxBlock + 1);
  let delayPos = 0;

  const cfg = { steps: 0, gain: 0, pan: 0, delay: 0, detuneCents: 0, driftPhase: 0 };
  let gainL = 1;
  let gainR = 1;
  let time = 0; // seconds, for the detune drift
  const shiftParams = { period: 0, ratio: 1, formant: 1 }; // reused, no per-block allocation

  return {
    /**
     * @param {object} c
     * @param {number} [c.steps=0]        scale steps from the lead's target (0 = double)
     * @param {number} c.gain
     * @param {number} [c.pan=0]          −1 left … 1 right
     * @param {number} [c.delayMs=0]
     * @param {number} [c.detuneCents=0]  average detune; drifts ±40 % around it
     * @param {number} [c.driftPhase=0]   so several doubles don't drift in sync
     */
    configure({ steps = 0, gain, pan = 0, delayMs = 0, detuneCents = 0, driftPhase = 0 }) {
      Object.assign(cfg, { steps, gain, pan, detuneCents, driftPhase });
      cfg.delay = Math.min(delayBuf.length - maxBlock - 1, Math.round((delayMs / 1000) * sampleRate));
      [gainL, gainR] = panGains(pan);
      delayBuf.fill(0);
    },

    get steps() {
      return cfg.steps;
    },

    /**
     * Shift `input` and ADD it, panned and scaled by `gain · level[i]`, into outL/outR.
     * @param {number} p.ratio         pitch ratio for this voice (before detune)
     * @param {Float32Array} level     per-sample common fade (voicing × mix × headroom)
     */
    process(input, outL, outR, { period, ratio, formant }, level) {
      const n = input.length;
      time += n / sampleRate;

      // Slow, irregular detune drift: two incommensurate sine LFOs.
      const drift =
        1 + 0.4 * (0.6 * Math.sin(2 * Math.PI * 0.23 * time + cfg.driftPhase) + 0.4 * Math.sin(2 * Math.PI * 0.37 * time + 2 * cfg.driftPhase));
      const cents = cfg.detuneCents * drift;
      shiftParams.period = period;
      shiftParams.ratio = ratio * 2 ** (cents / 1200);
      shiftParams.formant = formant;
      psola.process(input, shifted, scratch, shiftParams);

      const g = cfg.gain;
      const len = delayBuf.length;
      for (let i = 0; i < n; i++) {
        delayBuf[delayPos] = shifted[i];
        let readPos = delayPos - cfg.delay;
        if (readPos < 0) readPos += len;
        const y = delayBuf[readPos] * g * level[i];
        outL[i] += y * gainL;
        outR[i] += y * gainR;
        if (++delayPos === len) delayPos = 0;
      }
    },
  };
}
