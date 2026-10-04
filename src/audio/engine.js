// Audio engine: AudioContext, microphone and the worklet graph.
//
//   getUserMedia → MediaStreamSource → AudioWorkletNode("autotune") → destination
//
// In phase 1 the worklet outputs silence; it is connected to the destination
// only so the browser keeps pulling audio through it.

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
 * @param {object} handlers
 * @param {(p: {freq: number|null, confidence: number}) => void} handlers.onPitch
 * @param {(state: AudioContextState) => void} [handlers.onStateChange]
 */
export async function startEngine({ onPitch, onStateChange }) {
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
  node.port.onmessage = (e) => {
    if (e.data.type === 'pitch') onPitch(e.data);
  };
  source.connect(node).connect(ctx.destination);

  // iOS moves the context to "interrupted" on phone calls / app switches.
  ctx.onstatechange = () => onStateChange?.(ctx.state);

  return {
    resume: () => ctx.resume(),
    /** Latency figures for the debug panel; outputLatency can change over time. */
    getInfo: () => ({
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: ctx.outputLatency ?? null,
      windowMs: (BUFFER_SIZE / ctx.sampleRate) * 1000,
      hopMs: (HOP_SIZE / ctx.sampleRate) * 1000,
    }),
    async stop() {
      ctx.onstatechange = null;
      node.port.onmessage = null;
      source.disconnect();
      node.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      await ctx.close();
    },
  };
}
