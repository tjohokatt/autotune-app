// Recorder tap: while recording, copies its stereo input to the main thread
// in batches (fewer, larger messages than one per 128-sample quantum). It has
// no output; the engine connects it after the autotune node.
//
// Messages in:  { type: 'start' } | { type: 'stop' }
// Messages out: { type: 'chunk', samples: Float32Array (interleaved L R L R …) } … then { type: 'done' }

const FRAMES = 4096;
const CHANNELS = 2;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.batch = new Float32Array(FRAMES * CHANNELS);
    this.frames = 0;
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this.recording = true;
        this.frames = 0;
      } else if (e.data.type === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: 'done' });
      }
    };
  }

  flush() {
    if (this.frames === 0) return;
    // Hand the filled batch over without copying, then start a fresh one.
    const full = this.frames === FRAMES;
    const samples = full ? this.batch : this.batch.slice(0, this.frames * CHANNELS);
    this.port.postMessage({ type: 'chunk', samples }, [samples.buffer]);
    if (full) this.batch = new Float32Array(FRAMES * CHANNELS);
    this.frames = 0;
  }

  process(inputs) {
    const left = inputs[0]?.[0];
    if (!this.recording || !left) return true;
    const right = inputs[0][1] ?? left; // mono input → same on both sides
    for (let i = 0; i < left.length; i++) {
      const j = this.frames * CHANNELS;
      this.batch[j] = left[i];
      this.batch[j + 1] = right[i];
      if (++this.frames === FRAMES) this.flush();
    }
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
