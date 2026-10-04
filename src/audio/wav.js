// Minimal WAV encoder: 16-bit PCM, mono or interleaved stereo.
//
// Layout (all little-endian):
//   "RIFF" <file size − 8> "WAVE"
//   "fmt " 16 <format 1 = PCM> <channels> <sample rate> <byte rate> <block align> <bits>
//   "data" <data size> <samples…>   (stereo: L R L R …)

const HEADER_BYTES = 44;

/**
 * Float −1…1 → int16 (clipped). Negative values scale by 32768, positive by
 * 32767, so both −1 and +1 map exactly onto the int16 range. Takes are stored
 * like this while recording, which halves their memory use.
 */
export function floatToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * @param {(Float32Array|Int16Array)[]} chunks  interleaved samples; floats are in −1…1 (clipped)
 * @param {number} sampleRate
 * @param {number} [channels=1]
 * @returns {ArrayBuffer}
 */
export function encodeWav(chunks, sampleRate, channels = 1) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const dataBytes = length * 2;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const blockAlign = channels * 2;

  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (const chunk of chunks) {
    const ints = chunk instanceof Int16Array ? chunk : floatToInt16(chunk);
    for (let i = 0; i < ints.length; i++) {
      view.setInt16(offset, ints[i], true);
      offset += 2;
    }
  }
  return buffer;
}
