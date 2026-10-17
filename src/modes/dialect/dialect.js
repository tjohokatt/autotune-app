// Dialect changer view. Two ways in:
//  - say something: the recording gets the dialect's melody and tempo in your
//    own voice, or is transcribed on the device and read aloud in dialect;
//  - type a sentence: it is rewritten into the dialect and read aloud.

import { dialectsFor, getDialect, EXAMPLES } from '../../dialects/index.js';
import { translate } from '../../dialects/engine.js';
import { speak, stopSpeaking, speechSupported } from '../../dialects/speech.js';
import { createPresetPicker } from '../../ui/presets.js';
import { dialectVoice } from '../../dialects/voice.js';
import { transcribe } from '../../dialects/transcribe.js';
import { startClip, resample } from '../../audio/clip.js';
import { encodeWav } from '../../audio/wav.js';
import { normalizeGain, applyGain } from '../../audio/normalize.js';
import { formatTime } from '../../ui/recorder.js';

const LANG = 'sv';

const inputEl = document.querySelector('#dialect-input');
const outputEl = document.querySelector('#dialect-output');
const speakBtn = document.querySelector('#dialect-speak');
const exampleBtn = document.querySelector('#dialect-example');
const messageEl = document.querySelector('#dialect-message');
const recordBtn = document.querySelector('#voice-record');
const timerEl = document.querySelector('#voice-timer');
const actionsEl = document.querySelector('#voice-actions');
const melodyBtn = document.querySelector('#voice-melody');
const computerBtn = document.querySelector('#voice-computer');
const progressEl = document.querySelector('#voice-progress');
const resultEl = document.querySelector('#voice-result');
const resultTitle = document.querySelector('#voice-result-title');
const audioEl = document.querySelector('#voice-audio');
const downloadEl = document.querySelector('#voice-download');

const MAX_SECONDS = 10;

let dialect = dialectsFor(LANG)[0];
let exampleIndex = -1;
let clip = null; // the running recording
let recording = null; // { samples, sampleRate } of the last finished recording
let timer = 0;
let resultUrl = null;
let busy = false;

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
    resultEl.hidden = true;
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

// ---------- recording ----------

function renderRecord() {
  recordBtn.classList.toggle('recording', !!clip);
  recordBtn.setAttribute('aria-pressed', String(!!clip));
  recordBtn.textContent = clip ? '⏹ Stoppa' : recording ? '⏺ Spela in igen' : `⏺ Spela in (max ${MAX_SECONDS} s)`;
  timerEl.hidden = !clip;
  actionsEl.hidden = !recording || !!clip;
  melodyBtn.disabled = computerBtn.disabled = busy;
}

async function startRecording() {
  showMessage(null);
  stopSpeaking();
  audioEl.pause();
  try {
    clip = await startClip({ maxSeconds: MAX_SECONDS, onAutoStop: stopRecording });
  } catch (err) {
    console.error(err);
    showMessage(err.userMessage ?? 'Mikrofonen gick inte att starta.');
    return;
  }
  timerEl.textContent = `0:00 / ${formatTime(MAX_SECONDS)}`;
  timer = setInterval(() => {
    if (clip) timerEl.textContent = `${formatTime(clip.seconds())} / ${formatTime(MAX_SECONDS)}`;
  }, 250);
  renderRecord();
}

async function stopRecording() {
  if (!clip) return;
  const running = clip;
  clip = null;
  clearInterval(timer);
  const result = await running.stop();
  // The mic is quiet with auto gain off; bring the clip up before analysing it.
  applyGain([result.samples], normalizeGain([result.samples]));
  recording = result.samples.length > result.sampleRate * 0.3 ? result : null;
  if (!recording) showMessage('Inspelningen blev för kort. Försök igen!');
  resultEl.hidden = true;
  progressEl.textContent = '';
  renderRecord();
}

recordBtn.addEventListener('click', () => (clip ? stopRecording() : startRecording()));

function showResult(samples, sampleRate, title) {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = URL.createObjectURL(new Blob([encodeWav([samples], sampleRate)], { type: 'audio/wav' }));
  audioEl.src = resultUrl;
  downloadEl.href = resultUrl;
  downloadEl.download = `${dialect.id}.wav`;
  resultTitle.textContent = title;
  resultEl.hidden = false;
  audioEl.play().catch(() => {});
}

async function withBusy(fn) {
  if (busy || !recording) return;
  busy = true;
  showMessage(null);
  renderRecord();
  try {
    await fn();
  } finally {
    busy = false;
    renderRecord();
  }
}

melodyBtn.addEventListener('click', () =>
  withBusy(async () => {
    progressEl.textContent = '🎛️ Ändrar rösten …';
    // Let the text paint before the (synchronous) processing starts.
    await new Promise((r) => setTimeout(r, 30));
    const { samples, sampleRate } = recording;
    const out = dialectVoice(samples, sampleRate, dialect.voice);
    applyGain([out], normalizeGain([out]));
    progressEl.textContent = '';
    showResult(out, sampleRate, `🎤 Din röst på ${dialect.name.toLowerCase()}`);
  }),
);

computerBtn.addEventListener('click', () =>
  withBusy(async () => {
    resultEl.hidden = true;
    progressEl.textContent = '👂 Lyssnar …';
    try {
      const audio16k = await resample(recording.samples, recording.sampleRate, 16000);
      const text = await transcribe(audio16k, (f) => {
        progressEl.textContent = `⬇️ Laddar ner taligenkänningen (bara första gången): ${Math.round(f * 100)} %`;
      });
      progressEl.textContent = '';
      if (!text) {
        showMessage('Jag hörde inga ord. Prata lite högre och försök igen!');
        return;
      }
      // Reuse the text flow: show what was said, rewrite it, read it aloud.
      inputEl.value = text;
      render();
      speakBtn.click();
    } catch (err) {
      console.error(err);
      progressEl.textContent = '';
      showMessage('Taligenkänningen gick inte att ladda. Den behöver internet första gången.');
    }
  }),
);

/** Called by the router when the user leaves the dialect view. */
export function leaveDialect() {
  stopSpeaking();
  audioEl.pause();
  stopRecording();
}

renderRecord();

render();
