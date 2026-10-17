// Speech recognition in a Web Worker so the page stays responsive.
// Whisper runs on the device (WebAssembly). The audio never leaves it. The
// library and the model are downloaded once on first use (~80 MB) and then
// cached by the browser.
//
// Messages in:  { type: 'transcribe', audio: Float32Array (16 kHz mono) }
// Messages out: { type: 'progress', loaded, total } … { type: 'result', text } | { type: 'error', message }

const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.web.min.js';
const MODEL = 'onnx-community/whisper-base';

let transcriberPromise = null;

function loadTranscriber() {
  transcriberPromise ??= (async () => {
    const { pipeline } = await import(/* @vite-ignore */ LIBRARY);
    const files = new Map(); // file name → { loaded, total }
    return pipeline('automatic-speech-recognition', MODEL, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback(p) {
        if (p.status !== 'progress' || !p.total) return;
        files.set(p.file, { loaded: p.loaded, total: p.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        self.postMessage({ type: 'progress', loaded, total });
      },
    });
  })();
  // A failed download should be retried next time, not cached forever.
  transcriberPromise.catch(() => (transcriberPromise = null));
  return transcriberPromise;
}

self.onmessage = async (e) => {
  if (e.data.type !== 'transcribe') return;
  try {
    const transcriber = await loadTranscriber();
    const { text } = await transcriber(e.data.audio, { language: 'swedish', task: 'transcribe' });
    self.postMessage({ type: 'result', text: text.trim() });
  } catch (err) {
    self.postMessage({ type: 'error', message: String(err?.message ?? err) });
  }
};
