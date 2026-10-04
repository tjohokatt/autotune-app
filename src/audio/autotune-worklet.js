// AudioWorklet processor. Only wiring lives here; the DSP is in src/dsp/.
//
// Continuous values arrive as AudioParams (retuneMs, mix). Discrete settings
// arrive as port messages ({ type: 'options', key, scale, transpose,
// formantShift, humanize }). Detected pitch goes back as
// { type: 'pitch', freq, confidence, targetMidi }.

import { createAutotune } from '../dsp/autotune.js';

class AutotuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'retuneMs', defaultValue: 20, minValue: 0, maxValue: 1000, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const { bufferSize = 2048, hopSize = 512, reportsPerSecond = 30 } = options.processorOptions ?? {};

    // `sampleRate` is a global in AudioWorkletGlobalScope.
    this.autotune = createAutotune(sampleRate, { bufferSize, hopSize });
    this.samplesSinceReport = 0;
    this.reportInterval = Math.round(sampleRate / reportsPerSecond);
    this.params = { retuneMs: 20, mix: 1 };

    this.port.onmessage = (e) => {
      if (e.data.type === 'options') this.autotune.setOptions(e.data.options);
    };
    this.port.postMessage({ type: 'ready', latency: this.autotune.latency });
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0][0];
    if (!input) return true; // Mic not connected yet; output stays silent.

    this.params.retuneMs = parameters.retuneMs[0];
    this.params.mix = parameters.mix[0];
    this.autotune.process(input, output, this.params);

    // Throttle messages so the main thread is not flooded.
    this.samplesSinceReport += input.length;
    if (this.samplesSinceReport >= this.reportInterval) {
      this.samplesSinceReport = 0;
      const { freq, confidence, targetMidi } = this.autotune.status;
      this.port.postMessage({ type: 'pitch', freq, confidence, targetMidi });
    }

    return true;
  }
}

registerProcessor('autotune', AutotuneProcessor);
