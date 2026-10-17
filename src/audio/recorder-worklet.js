// Recorder tap: while recording, copies its input to the main thread in
// batches (fewer, larger messages than one per 128-sample quantum). It has no
// output. The engine feeds it two channels: 0 = the autotuned voice,
// 1 = the karaoke backing track, so they can be leveled separately.
//
// Messages in:  { type: 'start' } | { type: 'stop' }
// Messages out: { type: 'chunk', channels: Float32Array[] } … then { type: 'done' }

const BATCH = 4096;
const CHANNELS = 2;

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.batch = this.newBatch();
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

  newBatch() {
    return Array.from({ length: CHANNELS }, () => new Float32Array(BATCH));
  }

  flush() {
    if (this.filled === 0) return;
    // Hand the filled batch over without copying, then start a fresh one.
    const full = this.filled === BATCH;
    const channels = full ? this.batch : this.batch.map((c) => c.slice(0, this.filled));
    this.port.postMessage({ type: 'chunk', channels }, channels.map((c) => c.buffer));
    if (full) this.batch = this.newBatch();
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0];
    const length = input?.[0]?.length ?? 0;
    if (!this.recording || !length) return true;
    let i = 0;
    while (i < length) {
      const n = Math.min(length - i, BATCH - this.filled);
      // A missing channel (nothing connected yet) records as silence.
      for (let c = 0; c < CHANNELS; c++) {
        if (input[c]) this.batch[c].set(input[c].subarray(i, i + n), this.filled);
        else this.batch[c].fill(0, this.filled, this.filled + n);
      }
      this.filled += n;
      i += n;
      if (this.filled === BATCH) this.flush();
    }
    return true;
  }
}

registerProcessor('recorder', RecorderProcessor);
