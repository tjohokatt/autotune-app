// Main-thread side of the Whisper worker.

let worker = null;

/**
 * Transcribe 16 kHz mono audio to Swedish text.
 * @param {Float32Array} audio
 * @param {(fraction: number) => void} [onProgress]  model download progress 0…1
 * @returns {Promise<string>}
 */
export function transcribe(audio, onProgress) {
  worker ??= new Worker(new URL('./whisper-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg.loaded / msg.total);
      else if (msg.type === 'result') resolve(msg.text);
      else if (msg.type === 'error') reject(new Error(msg.message));
    };
    worker.postMessage({ type: 'transcribe', audio });
  });
}
