// Stereo algorithmic reverb, after "Freeverb" (Jezar at Dreampoint, public
// domain). Per channel:
//
//   in ─┬─ comb ─┐
//       ├─ comb ─┤  8 parallel feedback comb filters, each with a one-pole
//       ├─  …   ─┤  low-pass in its loop (high frequencies die out faster,
//       └─ comb ─┘  like in a real room)
//            Σ → allpass → allpass → allpass → allpass → out
//                (4 series allpasses smear the echoes into a dense tail)
//
// The right channel uses slightly longer delay lines (+23 samples), so left
// and right are decorrelated and the tail sounds wide. Delay lengths are the
// Freeverb tunings for 44.1 kHz, scaled to the actual sample rate.

const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];
const STEREO_SPREAD = 23;
const INPUT_GAIN = 0.015; // the 8 combs add up; keep the sum in range
const ALLPASS_FEEDBACK = 0.5;

function createChannel(sampleRate, spread) {
  const scale = sampleRate / 44100;
  const combs = COMB_TUNING.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * scale)), pos: 0, lp: 0 }));
  const allpasses = ALLPASS_TUNING.map((n) => ({ buf: new Float32Array(Math.round((n + spread) * scale)), pos: 0 }));
  return { combs, allpasses };
}

/**
 * @param {number} sampleRate
 * @returns {{ setSize(size: number): void, process(input: Float32Array, outL: Float32Array, outR: Float32Array, n?: number): void, clear(): void }}
 */
export function createReverb(sampleRate) {
  const channels = [createChannel(sampleRate, 0), createChannel(sampleRate, STEREO_SPREAD)];
  let feedback = 0.84;
  const damp = 0.3; // 0 = bright, 1 = dark

  function run(ch, x) {
    let out = 0;
    for (const c of ch.combs) {
      const y = c.buf[c.pos];
      c.lp = y * (1 - damp) + c.lp * damp; // low-pass in the feedback loop
      c.buf[c.pos] = x + c.lp * feedback;
      if (++c.pos === c.buf.length) c.pos = 0;
      out += y;
    }
    for (const a of ch.allpasses) {
      const b = a.buf[a.pos];
      a.buf[a.pos] = out + b * ALLPASS_FEEDBACK;
      if (++a.pos === a.buf.length) a.pos = 0;
      out = b - out;
    }
    return out;
  }

  return {
    /** 0 = small room … 1 = big hall (comb feedback 0.7 … 0.98). */
    setSize(size) {
      feedback = 0.7 + 0.28 * Math.max(0, Math.min(1, size));
    },

    /** Writes the wet (reverb-only) signal for `n` samples of mono input. */
    process(input, outL, outR, n = input.length) {
      const [left, right] = channels;
      for (let i = 0; i < n; i++) {
        const x = input[i] * INPUT_GAIN;
        outL[i] = run(left, x);
        outR[i] = run(right, x);
      }
    },

    clear() {
      for (const ch of channels) {
        for (const c of ch.combs) {
          c.buf.fill(0);
          c.lp = 0;
        }
        for (const a of ch.allpasses) a.buf.fill(0);
      }
    },
  };
}
