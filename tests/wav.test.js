import { describe, it, expect } from 'vitest';
import { encodeWav, floatToInt16 } from '../src/audio/wav.js';
import { createYin } from '../src/dsp/yin.js';
import { sine, centsBetween } from './signals.js';

function ascii(view, offset, length) {
  return String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));
}

/** Read back the samples of a 16-bit mono WAV as floats. */
function decode(buffer) {
  const view = new DataView(buffer);
  const n = view.getUint32(40, true) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(44 + i * 2, true) / 32768;
  return out;
}

describe('encodeWav', () => {
  it('writes a valid 16-bit mono PCM header', () => {
    const buffer = encodeWav([new Float32Array(100), new Float32Array(50)], 48000);
    const view = new DataView(buffer);
    expect(buffer.byteLength).toBe(44 + 150 * 2);
    expect(ascii(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(ascii(view, 8, 4)).toBe('WAVE');
    expect(ascii(view, 12, 4)).toBe('fmt ');
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(96000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(300);
  });

  it('concatenates chunks in order and clips out-of-range samples', () => {
    const view = new DataView(encodeWav([Float32Array.of(0, 0.5), Float32Array.of(-1, 1, 2, -3)], 44100));
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 16383, -32768, 32767, 32767, -32768]);
  });

  it('handles an empty take', () => {
    expect(encodeWav([], 48000).byteLength).toBe(44);
  });

  it('round-trips a tone with its pitch intact', () => {
    const input = sine(440, 48000, 4800, 0.5);
    const decoded = decode(encodeWav([input.subarray(0, 1000), input.subarray(1000)], 48000));
    expect(decoded.length).toBe(input.length);
    let err = 0;
    for (let i = 0; i < input.length; i++) err = Math.max(err, Math.abs(decoded[i] - input[i]));
    expect(err).toBeLessThan(1 / 16000);
    expect(Math.abs(centsBetween(createYin(48000, 2048)(decoded).freq, 440))).toBeLessThan(5);
  });
});

describe('stereo WAV', () => {
  it('writes a stereo header with block align 4', () => {
    const view = new DataView(encodeWav([new Float32Array(200)], 44100, 2)); // 100 frames
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(28, true)).toBe(44100 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(40, true)).toBe(400);
  });

  it('keeps interleaved L R order and accepts int16 chunks', () => {
    const lr = Float32Array.of(0.5, -0.5, 1, -1);
    const view = new DataView(encodeWav([floatToInt16(lr)], 48000, 2));
    const s = Array.from({ length: 4 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(s).toEqual([16383, -16384, 32767, -32768]);
  });

  it('gives identical bytes for float and int16 input', () => {
    const x = Float32Array.of(0.1, -0.2, 0.3, 2, -2);
    expect(new Uint8Array(encodeWav([x], 48000))).toEqual(new Uint8Array(encodeWav([floatToInt16(x)], 48000)));
  });
});
