// Audio engine: AudioContext, microphone and the worklet graph.
//
//   getUserMedia → MediaStreamSource → AudioWorkletNode("autotune") ─┬→ GainNode (monitor) → destination
//                                                                   └→ AudioWorkletNode("recorder")
//
// The monitor gain starts wherever the UI says (0 = off until the user turns
// on live monitoring with headphones). The worklet stays connected either way
// so it keeps running. The recorder taps the autotuned signal before the
// monitor gain, so a take sounds the same whether monitoring is on or off.

// `?worker&url` makes Vite bundle the worklet together with its imports
// (src/dsp/*) into a single ES module, which audioWorklet.addModule() needs.
import workletUrl from './autotune-worklet.js?worker&url';
import recorderUrl from './recorder-worklet.js?worker&url';
import { encodeWav } from './wav.js';

export const BUFFER_SIZE = 2048;
export const HOP_SIZE = 512;

/** Error with a Swedish, child-friendly message for the UI. */
export class EngineError extends Error {
  constructor(userMessage, cause) {
    super(userMessage, { cause });
    this.userMessage = userMessage;
  }
}

function friendlyError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new EngineError(
        'Vi fick inte använda mikrofonen. Tryck på hänglåset i adressfältet och tillåt mikrofon, och försök sedan igen.',
        err,
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new EngineError('Vi hittade ingen mikrofon. Koppla in en och försök igen.', err);
    case 'NotReadableError':
      return new EngineError('Mikrofonen används av något annat program. Stäng det och försök igen.', err);
    default:
      return new EngineError('Något gick fel när ljudet skulle startas. Ladda om sidan och försök igen.', err);
  }
}

/**
 * Start the audio engine. Must be called from a user gesture (tap/click):
 * iOS Safari only allows an AudioContext to start inside one.
 *
 * @param {object} cfg
 * @param {(p: {freq: number|null, confidence: number, targetMidi: number|null}) => void} cfg.onPitch
 * @param {(state: AudioContextState) => void} [cfg.onStateChange]
 * @param {{ options: object, retuneMs: number, mix: number, monitorVolume: number }} cfg.settings
 */
export async function startEngine({ onPitch, onStateChange, settings }) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new EngineError('Mikrofonen fungerar bara över HTTPS. Öppna sidan med https://.');
  }
  if (typeof AudioWorkletNode === 'undefined') {
    throw new EngineError('Den här webbläsaren är för gammal. Uppdatera den och försök igen.');
  }

  // Tell iOS we both record and play, so output is not muted when the mic opens.
  if (navigator.audioSession) navigator.audioSession.type = 'play-and-record';

  // Create the context synchronously inside the gesture, before any await.
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  let stream;
  try {
    const resumed = ctx.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // These browser "voice call" filters ruin pitch detection.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    await resumed;
    await Promise.all([ctx.audioWorklet.addModule(workletUrl), ctx.audioWorklet.addModule(recorderUrl)]);
  } catch (err) {
    stream?.getTracks().forEach((t) => t.stop());
    ctx.close();
    throw err instanceof EngineError ? err : friendlyError(err);
  }

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'autotune', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { bufferSize: BUFFER_SIZE, hopSize: HOP_SIZE },
  });
  let dspLatency = 0; // samples, reported by the worklet
  node.port.onmessage = (e) => {
    if (e.data.type === 'pitch') onPitch(e.data);
    else if (e.data.type === 'ready') dspLatency = e.data.latency;
  };

  const monitor = ctx.createGain();
  monitor.gain.value = settings.monitorVolume;
  source.connect(node).connect(monitor).connect(ctx.destination);

  // Recording: the recorder worklet streams batches of samples while a take
  // is running; they are collected here and turned into a WAV at the end.
  const recorder = new AudioWorkletNode(ctx, 'recorder', { numberOfInputs: 1, numberOfOutputs: 0 });
  node.connect(recorder);
  let take = null; // { chunks, samples, stopped: Promise | null, resolve }
  recorder.port.onmessage = (e) => {
    if (!take) return;
    if (e.data.type === 'chunk') {
      take.chunks.push(e.data.samples);
      take.samples += e.data.samples.length;
    } else if (e.data.type === 'done') {
      const { chunks, samples, resolve } = take;
      take = null;
      const wav = encodeWav(chunks, ctx.sampleRate);
      resolve({ blob: new Blob([wav], { type: 'audio/wav' }), duration: samples / ctx.sampleRate });
    }
  };

  function startRecording() {
    if (take) return;
    take = { chunks: [], samples: 0, stopped: null, resolve: null };
    recorder.port.postMessage({ type: 'start' });
  }

  /** @returns {Promise<{ blob: Blob, duration: number } | null>} */
  function stopRecording() {
    if (!take) return Promise.resolve(null);
    take.stopped ??= new Promise((resolve) => {
      take.resolve = resolve;
      recorder.port.postMessage({ type: 'stop' });
    });
    return take.stopped;
  }

  const retuneParam = node.parameters.get('retuneMs');
  const mixParam = node.parameters.get('mix');
  retuneParam.value = settings.retuneMs;
  mixParam.value = settings.mix;
  // Short ramps so slider moves don't click.
  const glide = (param, value) => param.setTargetAtTime(value, ctx.currentTime, 0.02);
  const setOptions = (options) => node.port.postMessage({ type: 'options', options });
  setOptions(settings.options);

  // iOS moves the context to "interrupted" on phone calls / app switches.
  ctx.onstatechange = () => onStateChange?.(ctx.state);

  return {
    resume: () => ctx.resume(),
    /** Discrete settings: any of { key, scale, transpose, formantShift, humanize }. */
    setOptions,
    setRetuneMs: (ms) => glide(retuneParam, ms),
    setMix: (mix) => glide(mixParam, mix),
    setMonitorVolume: (v) => glide(monitor.gain, v),
    startRecording,
    stopRecording,
    /** Seconds recorded so far in the current take (0 when not recording). */
    recordedSeconds: () => (take ? take.samples / ctx.sampleRate : 0),
    /** Latency figures for the debug panel; outputLatency can change over time. */
    getInfo: () => ({
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: ctx.outputLatency ?? null,
      dspLatency: dspLatency / ctx.sampleRate,
      windowMs: (BUFFER_SIZE / ctx.sampleRate) * 1000,
      hopMs: (HOP_SIZE / ctx.sampleRate) * 1000,
    }),
    /** Stops everything. Call stopRecording() first to keep a running take. */
    async stop() {
      ctx.onstatechange = null;
      node.port.onmessage = null;
      recorder.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      monitor.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}
