import './styles.css';
import { startEngine } from './audio/engine.js';
import { PRESETS, DEFAULT_PRESET_ID, getPreset } from './presets.js';
import { createTuner } from './ui/tuner.js';
import { createPresetPicker } from './ui/presets.js';
import { createSettings } from './ui/settings.js';
import { createRecorderUI } from './ui/recorder.js';

const startBtn = document.querySelector('#start');
const resumeBtn = document.querySelector('#resume');
const monitorBtn = document.querySelector('#monitor');
const headphonesTip = document.querySelector('#headphones-tip');
const messageEl = document.querySelector('#message');
const debugEl = document.querySelector('#debug-info');
const tuner = createTuner(document.querySelector('#tuner'));

// Everything the user can change. Presets overwrite the style-related part.
const state = {
  preset: getPreset(DEFAULT_PRESET_ID),
  key: 0,
  scale: getPreset(DEFAULT_PRESET_ID).scale,
  retuneMs: getPreset(DEFAULT_PRESET_ID).retuneMs,
  mix: getPreset(DEFAULT_PRESET_ID).mix,
  monitorOn: false,
  monitorVolume: 0.8,
};

let engine = null;
let busy = false;
let debugTimer = 0;

const recorderUI = createRecorderUI(document.querySelector('#recorder'), () => engine);

/** Discrete options sent to the worklet. */
function dspOptions() {
  const { preset, key, scale } = state;
  return { key, scale, transpose: preset.transpose, formantShift: preset.formantShift, humanize: preset.humanize };
}

function effectiveVolume() {
  return state.monitorOn ? state.monitorVolume : 0;
}

const settings = createSettings(document.querySelector('#settings'), state, (change) => {
  Object.assign(state, change);
  if ('key' in change || 'scale' in change) engine?.setOptions(dspOptions());
  if ('retuneMs' in change) engine?.setRetuneMs(state.retuneMs);
  if ('mix' in change) engine?.setMix(state.mix);
  if ('monitorVolume' in change) engine?.setMonitorVolume(effectiveVolume());
});

createPresetPicker(document.querySelector('#presets'), PRESETS, {
  selectedId: state.preset.id,
  onSelect(preset) {
    Object.assign(state, { preset, scale: preset.scale, retuneMs: preset.retuneMs, mix: preset.mix });
    settings.set(state);
    engine?.setOptions(dspOptions());
    engine?.setRetuneMs(state.retuneMs);
    engine?.setMix(state.mix);
  },
});

function renderMonitor() {
  monitorBtn.setAttribute('aria-pressed', String(state.monitorOn));
  monitorBtn.textContent = state.monitorOn ? '🎧 Hör mig själv: PÅ' : '🎧 Hör mig själv: AV';
  headphonesTip.hidden = !state.monitorOn;
}

monitorBtn.addEventListener('click', () => {
  state.monitorOn = !state.monitorOn;
  renderMonitor();
  engine?.setMonitorVolume(effectiveVolume());
});

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
  const total = (i.baseLatency ?? 0) + (i.outputLatency ?? 0) + i.dspLatency + 128 / i.sampleRate;
  debugEl.textContent = [
    `Samplingsfrekvens: ${i.sampleRate} Hz`,
    `baseLatency: ${ms(i.baseLatency)}`,
    `outputLatency: ${ms(i.outputLatency)}`,
    `Autotune (PSOLA): ${ms(i.dspLatency)}`,
    `Totalt (uppskattat, utan mikrofon): ${ms(total)}`,
    `Analysfönster: ${i.windowMs.toFixed(1)} ms (var ${i.hopMs.toFixed(1)} ms)`,
  ].join('\n');
}

function onStateChange(ctxState) {
  // "interrupted" (iOS) or "suspended" while we think we're running.
  resumeBtn.hidden = ctxState === 'running';
}

async function start() {
  busy = true;
  startBtn.disabled = true;
  showMessage(null);
  try {
    engine = await startEngine({
      onPitch: tuner.update,
      onStateChange,
      settings: {
        options: dspOptions(),
        retuneMs: state.retuneMs,
        mix: state.mix,
        monitorVolume: effectiveVolume(),
      },
    });
    tuner.start();
    recorderUI.setEnabled(true);
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
  // Keep a take that is still recording before the audio graph goes away.
  await recorderUI.stop();
  recorderUI.setEnabled(false);
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

recorderUI.setEnabled(false);
renderMonitor();
renderDebug();
