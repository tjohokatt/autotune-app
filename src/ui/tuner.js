// Live tuner display: sung note, cents text, needle meter and the note the
// autotune is pulling towards.
// Pitch messages arrive ~30×/s; drawing happens once per animation frame.

import { describePitch, noteName } from '../dsp/notes.js';

const HOLD_MS = 400; // keep showing the last note briefly through short gaps

export function createTuner(root) {
  const noteEl = root.querySelector('[data-note]');
  const centsEl = root.querySelector('[data-cents]');
  const needleEl = root.querySelector('[data-needle]');
  const freqEl = root.querySelector('[data-freq]');
  const targetEl = root.querySelector('[data-target]');

  let latest = null; // { freq, confidence, targetMidi, at }
  let lastPitched = null; // last message that had a pitch
  let raf = 0;

  function draw() {
    raf = requestAnimationFrame(draw);
    const now = performance.now();
    const shown = latest?.freq ? latest : lastPitched && now - lastPitched.at < HOLD_MS ? lastPitched : null;

    if (!shown) {
      noteEl.textContent = '–';
      centsEl.textContent = 'Sjung en ton!';
      root.dataset.tune = 'none';
      needleEl.style.setProperty('--cents', 0);
      freqEl.textContent = '';
      targetEl.textContent = '';
      return;
    }

    const { name, cents } = describePitch(shown.freq);
    const rounded = Math.round(cents);
    noteEl.textContent = name;
    centsEl.textContent = rounded === 0 ? 'Mitt i prick!' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} cent`;
    root.dataset.tune = Math.abs(cents) < 10 ? 'good' : Math.abs(cents) < 25 ? 'close' : 'off';
    needleEl.style.setProperty('--cents', cents.toFixed(1));
    freqEl.textContent = `${shown.freq.toFixed(1)} Hz`;
    targetEl.textContent = shown.targetMidi != null ? `🎶 Blir: ${noteName(shown.targetMidi)}` : '';
  }

  return {
    update(pitch) {
      latest = { ...pitch, at: performance.now() };
      if (pitch.freq) lastPitched = latest;
    },
    start() {
      if (!raf) draw();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
      latest = lastPitched = null;
      noteEl.textContent = '–';
      centsEl.textContent = 'Tryck på Starta';
      root.dataset.tune = 'none';
      needleEl.style.setProperty('--cents', 0);
      freqEl.textContent = '';
      targetEl.textContent = '';
    },
  };
}
