// Short voice recordings for the dialect changer: mic → recorder worklet →
// Float32Array. No autotune, no monitoring. The mic is released as soon as
// the clip is done.

import recorderUrl from './recorder-worklet.js?worker&url';
import { EngineError, friendlyError } from './engine.js';

/**
 * Start recording. Must be called from a tap (iOS needs that for audio).
 * @param {{ maxSeconds?: number, onAutoStop?: () => void }} [opts]
 * @returns {Promise<{ stop: () => Promise<{ samples: Float32Array, sampleRate: number }>, seconds: () => number }>}
 */
export async function startClip({ maxSeconds = 10, onAutoStop } = {}) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new EngineError('Mikrofonen fungerar bara över HTTPS. Öppna sidan med https://.');
  }
  if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';
  const ctx = new AudioContext();
  let stream;
  try {
    const resumed = ctx.resume();
    // Same as autotune: the browser's voice filters would distort the melody analysis.
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await resumed;
    await ctx.audioWorklet.addModule(recorderUrl);
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop());
    ctx.close();
    throw err instanceof EngineError ? err : friendlyError(err);
  }

  const source = ctx.createMediaStreamSource(stream);
  const recorder = new AudioWorkletNode(ctx, 'recorder', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  source.connect(recorder);

  const chunks = [];
  let length = 0;
  let finished = null;
  let resolveDone;
  const done = new Promise((resolve) => (resolveDone = resolve));
  recorder.port.onmessage = (e) => {
    if (e.data.type === 'chunk') {
      chunks.push(e.data.samples);
      length += e.data.samples.length;
      if (length >= maxSeconds * ctx.sampleRate && !finished) onAutoStop?.();
    } else if (e.data.type === 'done') {
      resolveDone();
    }
  };
  recorder.port.postMessage({ type: 'start' });

  async function stop() {
    finished ??= (async () => {
      recorder.port.postMessage({ type: 'stop' });
      await done;
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      const sampleRate = ctx.sampleRate;
      await ctx.close();
      const samples = new Float32Array(Math.min(length, Math.ceil(maxSeconds * sampleRate)));
      let pos = 0;
      for (const c of chunks) {
        const n = Math.min(c.length, samples.length - pos);
        if (n <= 0) break;
        samples.set(c.subarray(0, n), pos);
        pos += n;
      }
      return { samples, sampleRate };
    })();
    return finished;
  }

  return { stop, seconds: () => length / ctx.sampleRate };
}

/** Resample with the browser's own resampler (OfflineAudioContext). */
export async function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const out = new OfflineAudioContext(1, Math.ceil((samples.length * toRate) / fromRate), toRate);
  const buffer = out.createBuffer(1, samples.length, fromRate);
  buffer.copyToChannel(samples, 0);
  const src = out.createBufferSource();
  src.buffer = buffer;
  src.connect(out.destination);
  src.start();
  return (await out.startRendering()).getChannelData(0);
}
