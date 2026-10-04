import './styles.css';
import { startEngine } from './audio/engine.js';
import { createTuner } from './ui/tuner.js';

const startBtn = document.querySelector('#start');
const resumeBtn = document.querySelector('#resume');
const messageEl = document.querySelector('#message');
const debugEl = document.querySelector('#debug-info');
const tuner = createTuner(document.querySelector('#tuner'));

let engine = null;
let busy = false;
let debugTimer = 0;

function showMessage(text) {
  messageEl.textContent = text ?? '';
  messageEl.hidden = !text;
}

function ms(seconds) {
  return seconds == null ? 'okänd' : `${(seconds * 1000).toFixed(1)} ms`;
}

function renderDebug() {
  if (!engine) {
    debugEl.textContent = 'Inte startad.';
    return;
  }
  const i = engine.getInfo();
  debugEl.textContent = [
    `Samplingsfrekvens: ${i.sampleRate} Hz`,
    `baseLatency: ${ms(i.baseLatency)}`,
    `outputLatency: ${ms(i.outputLatency)}`,
    `Analysfönster: ${i.windowMs.toFixed(1)} ms (var ${i.hopMs.toFixed(1)} ms)`,
  ].join('\n');
}

function onStateChange(state) {
  // "interrupted" (iOS) or "suspended" while we think we're running.
  resumeBtn.hidden = state === 'running';
}

async function start() {
  busy = true;
  startBtn.disabled = true;
  showMessage(null);
  try {
    engine = await startEngine({ onPitch: tuner.update, onStateChange });
    tuner.start();
    startBtn.textContent = 'Stoppa';
    startBtn.classList.add('running');
    debugTimer = setInterval(renderDebug, 1000);
    renderDebug();
  } catch (err) {
    console.error(err);
    showMessage(err.userMessage ?? 'Något gick fel. Ladda om sidan och försök igen.');
  } finally {
    busy = false;
    startBtn.disabled = false;
  }
}

async function stop() {
  busy = true;
  clearInterval(debugTimer);
  tuner.stop();
  resumeBtn.hidden = true;
  await engine?.stop();
  engine = null;
  renderDebug();
  startBtn.textContent = 'Starta';
  startBtn.classList.remove('running');
  busy = false;
}

startBtn.addEventListener('click', () => {
  if (busy) return;
  engine ? stop() : start();
});

resumeBtn.addEventListener('click', () => engine?.resume());

renderDebug();
