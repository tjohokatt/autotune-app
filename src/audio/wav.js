// Minimal WAV encoder: mono, 16-bit PCM.
//
// Layout (all little-endian):
//   "RIFF" <file size − 8> "WAVE"
//   "fmt " 16 <format 1 = PCM> <channels> <sample rate> <byte rate> <block align> <bits>
//   "data" <data size> <samples…>

const HEADER_BYTES = 44;

/**
 * @param {Float32Array[]} chunks  audio in −1…1 (clipped if outside)
 * @param {number} sampleRate
 * @returns {ArrayBuffer}
 */
export function encodeWav(chunks, sampleRate) {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  const dataBytes = length * 2;
  const buffer = new ArrayBuffer(HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);

  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate = rate × block align
  view.setUint16(32, 2, true); // block align = channels × 2 bytes
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);

  // Float −1…1 → int16. Negative values scale by 32768, positive by 32767,
  // so both −1 and +1 map exactly onto the int16 range.
  let offset = HEADER_BYTES;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}
