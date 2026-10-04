// AudioWorklet processor. Only wiring lives here; the DSP is in src/dsp/.
// Phase 1: detect pitch and report it to the main thread (no audio output yet).

import { createYin } from '../dsp/yin.js';

class AutotuneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { bufferSize = 2048, hopSize = 512, reportsPerSecond = 30 } = options.processorOptions ?? {};

    this.bufferSize = bufferSize;
    this.hopSize = hopSize;
    // `sampleRate` is a global in AudioWorkletGlobalScope.
    this.detect = createYin(sampleRate, bufferSize);

    // Ring buffer of the most recent input, plus a linear copy for analysis.
    this.ring = new Float32Array(bufferSize);
    this.writePos = 0;
    this.analysis = new Float32Array(bufferSize);

    this.samplesSinceAnalysis = 0;
    this.samplesSinceReport = 0;
    this.reportInterval = Math.round(sampleRate / reportsPerSecond);
    this.latest = { freq: null, confidence: 0 };
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true; // Mic not connected yet; keep the processor alive.

    // Append this render quantum (usually 128 samples) to the ring buffer.
    for (let i = 0; i < input.length; i++) {
      this.ring[this.writePos] = input[i];
      this.writePos = (this.writePos + 1) % this.bufferSize;
    }

    this.samplesSinceAnalysis += input.length;
    if (this.samplesSinceAnalysis >= this.hopSize) {
      this.samplesSinceAnalysis = 0;
      // Unroll the ring so the oldest sample is at index 0.
      const tail = this.bufferSize - this.writePos;
      this.analysis.set(this.ring.subarray(this.writePos), 0);
      this.analysis.set(this.ring.subarray(0, this.writePos), tail);
      this.latest = this.detect(this.analysis);
    }

    // Throttle messages so the main thread is not flooded.
    this.samplesSinceReport += input.length;
    if (this.samplesSinceReport >= this.reportInterval) {
      this.samplesSinceReport = 0;
      this.port.postMessage({ type: 'pitch', ...this.latest });
    }

    return true;
  }
}

registerProcessor('autotune', AutotuneProcessor);
