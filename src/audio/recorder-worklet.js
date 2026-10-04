// Recorder tap: while recording, copies its input to the main thread in
// batches (fewer, larger messages than one per 128-sample quantum). It has no
// output; the engine connects it after the autotune node.
//
// Messages in:  { type: 'start' } | { type: 'stop' }
// Messages out: { type: 'chunk', samples: Float32Array } … then { type: 'done' }

const BATCH = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.batch = new Float32Array(BATCH);
    this.filled = 0;
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this.recording = true;
        this.filled = 0;
      } else if (e.data.type === 'stop') {
        this.flush();
        this.recording = false;
        this.port.postMessage({ type: 'done' });
      }
    };
  }

  flush() {
    if (this.filled === 0) return;
    // Hand the filled batch over without copying, then start a fresh one.
    const samples = this.filled === BATCH ? this.batch : this.batch.slice(0, this.filled);
    this.port.postMessage({ type: 'chunk', samples }, [samples.buffer]);
    if (samples === this.batch) this.batch = new Float32Array(BATCH);
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!this.recording || !input) return true;
    let i = 0;
    while (i < input.length) {
      const n = Math.min(input.length - i, BATCH - this.filled);
      this.batch.set(input.subarray(i, i + n), this.filled);
      this.filled += n;
      i += n;
      if (this.filled === BATCH) this.flush();
    }
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
