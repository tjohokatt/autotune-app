// Tucked-away settings: key, scale, retune speed, mix, monitor volume.
// Values are plain numbers/strings; the caller decides what they mean.

import { NOTE_NAMES } from '../dsp/notes.js';

const SCALE_LABELS = {
  chromatic: 'Alla toner (kromatisk)',
  major: 'Dur',
  minor: 'Moll',
  pentatonic: 'Pentatonisk',
};

export function createSettings(root, initial, onChange) {
  const keyEl = root.querySelector('#key');
  const scaleEl = root.querySelector('#scale');
  const retuneEl = root.querySelector('#retune');
  const mixEl = root.querySelector('#mix');
  const volumeEl = root.querySelector('#volume');
  const retuneOut = root.querySelector('#retune-value');
  const mixOut = root.querySelector('#mix-value');
  const volumeOut = root.querySelector('#volume-value');

  NOTE_NAMES.forEach((name, i) => keyEl.add(new Option(name, String(i))));
  for (const [id, label] of Object.entries(SCALE_LABELS)) scaleEl.add(new Option(label, id));

  function showLabels() {
    retuneOut.textContent = retuneEl.value === '0' ? '0 ms (robot)' : `${retuneEl.value} ms`;
    mixOut.textContent = `${mixEl.value} %`;
    volumeOut.textContent = `${volumeEl.value} %`;
  }

  function set(values) {
    if (values.key != null) keyEl.value = String(values.key);
    if (values.scale != null) scaleEl.value = values.scale;
    if (values.retuneMs != null) retuneEl.value = String(values.retuneMs);
    if (values.mix != null) mixEl.value = String(Math.round(values.mix * 100));
    if (values.monitorVolume != null) volumeEl.value = String(Math.round(values.monitorVolume * 100));
    showLabels();
  }

  keyEl.addEventListener('change', () => onChange({ key: Number(keyEl.value) }));
  scaleEl.addEventListener('change', () => onChange({ scale: scaleEl.value }));
  retuneEl.addEventListener('input', () => {
    showLabels();
    onChange({ retuneMs: Number(retuneEl.value) });
  });
  mixEl.addEventListener('input', () => {
    showLabels();
    onChange({ mix: Number(mixEl.value) / 100 });
  });
  volumeEl.addEventListener('input', () => {
    showLabels();
    onChange({ monitorVolume: Number(volumeEl.value) / 100 });
  });

  set(initial);
  return { set };
}
