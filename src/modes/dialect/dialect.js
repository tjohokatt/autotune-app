// Dialect changer view: type a sentence, pick a dialect, read the result aloud.

import { dialectsFor, getDialect, EXAMPLES } from '../../dialects/index.js';
import { translate } from '../../dialects/engine.js';
import { speak, stopSpeaking, speechSupported } from '../../dialects/speech.js';
import { createPresetPicker } from '../../ui/presets.js';

const LANG = 'sv';

const inputEl = document.querySelector('#dialect-input');
const outputEl = document.querySelector('#dialect-output');
const speakBtn = document.querySelector('#dialect-speak');
const exampleBtn = document.querySelector('#dialect-example');
const messageEl = document.querySelector('#dialect-message');

let dialect = dialectsFor(LANG)[0];
let exampleIndex = -1;

function render() {
  const text = inputEl.value.trim();
  outputEl.textContent = text ? translate(text, dialect) : 'Skriv något ovanför så översätter jag! ✨';
  outputEl.classList.toggle('empty', !text);
  speakBtn.disabled = !text || !speechSupported();
}

function showMessage(text) {
  messageEl.textContent = text ?? '';
  messageEl.hidden = !text;
}

// Same big cards as the autotune styles.
createPresetPicker(document.querySelector('#dialects'), dialectsFor(LANG), {
  selectedId: dialect.id,
  onSelect(d) {
    dialect = getDialect(d.id);
    stopSpeaking();
    render();
  },
});

inputEl.addEventListener('input', render);

exampleBtn.addEventListener('click', () => {
  const examples = EXAMPLES[LANG];
  exampleIndex = (exampleIndex + 1) % examples.length;
  inputEl.value = examples[exampleIndex];
  render();
});

speakBtn.addEventListener('click', async () => {
  showMessage(null);
  const text = outputEl.textContent;
  const ok = await speak(text, dialect, {
    onStart: () => speakBtn.classList.add('running'),
    onEnd: () => speakBtn.classList.remove('running'),
  });
  if (!ok) showMessage('Den här enheten har ingen svensk uppläsningsröst. Texten fungerar ändå!');
});

if (!speechSupported()) showMessage('Uppläsning fungerar inte i den här webbläsaren, men du kan fortfarande läsa texten.');

/** Called by the router when the user leaves the dialect view. */
export function leaveDialect() {
  stopSpeaking();
}

render();
