// Audio engine: AudioContext, microphone and the worklet graph.
//
//   getUserMedia → MediaStreamSource → AudioWorkletNode("autotune") → GainNode (monitor) → destination
//
// The monitor gain starts wherever the UI says (0 = off until the user turns
// on live monitoring with headphones). The worklet stays connected either way
// so it keeps running.

// `?worker&url` makes Vite bundle the worklet together with its imports
// (src/dsp/*) into a single ES module, which audioWorklet.addModule() needs.
import workletUrl from './autotune-worklet.js?worker&url';

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
    await ctx.audioWorklet.addModule(workletUrl);
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
    /** Latency figures for the debug panel; outputLatency can change over time. */
    getInfo: () => ({
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: ctx.outputLatency ?? null,
      dspLatency: dspLatency / ctx.sampleRate,
      windowMs: (BUFFER_SIZE / ctx.sampleRate) * 1000,
      hopMs: (HOP_SIZE / ctx.sampleRate) * 1000,
    }),
    async stop() {
      ctx.onstatechange = null;
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      monitor.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}
