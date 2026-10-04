// Record button, timer and the take card (player, download, discard).
// One take at a time: a new recording replaces the previous one.

export const MAX_TAKE_SECONDS = 5 * 60;

/** 75.4 → "1:15" */
export function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Local-time file name, e.g. "autotune-2026-10-04-1830.wav". */
export function takeFileName(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `autotune-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.wav`;
}

/**
 * @param {HTMLElement} root
 * @param {() => object | null} getEngine  the running engine, or null
 */
export function createRecorderUI(root, getEngine) {
  const recordBtn = root.querySelector('#record');
  const timerEl = root.querySelector('#record-timer');
  const takeEl = root.querySelector('#take');
  const audioEl = root.querySelector('#take-audio');
  const downloadEl = root.querySelector('#take-download');
  const discardBtn = root.querySelector('#take-discard');
  const infoEl = root.querySelector('#take-info');

  let recording = false;
  let timer = 0;
  let url = null;

  function render() {
    recordBtn.classList.toggle('recording', recording);
    recordBtn.textContent = recording ? '⏹ Stoppa inspelningen' : '⏺ Spela in';
    recordBtn.setAttribute('aria-pressed', String(recording));
    timerEl.hidden = !recording;
  }

  function tick() {
    const seconds = getEngine()?.recordedSeconds() ?? 0;
    timerEl.textContent = `${formatTime(seconds)} / ${formatTime(MAX_TAKE_SECONDS)}`;
    if (seconds >= MAX_TAKE_SECONDS) stop();
  }

  function clearTake() {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
    if (url) URL.revokeObjectURL(url);
    url = null;
    takeEl.hidden = true;
  }

  function showTake({ blob, duration }) {
    clearTake();
    url = URL.createObjectURL(blob);
    audioEl.src = url;
    downloadEl.href = url;
    downloadEl.download = takeFileName();
    const mb = (blob.size / 1e6).toFixed(1).replace('.', ',');
    infoEl.textContent = `${formatTime(duration)} · ${mb} MB`;
    takeEl.hidden = false;
  }

  function start() {
    const engine = getEngine();
    if (!engine || recording) return;
    clearTake();
    engine.startRecording();
    recording = true;
    timerEl.textContent = `${formatTime(0)} / ${formatTime(MAX_TAKE_SECONDS)}`;
    timer = setInterval(tick, 250);
    render();
  }

  /** Finish the current take (if any) and show it. Safe to call anytime. */
  async function stop() {
    if (!recording) return;
    recording = false;
    clearInterval(timer);
    render();
    const result = await getEngine()?.stopRecording();
    if (result && result.duration > 0) showTake(result);
  }

  recordBtn.addEventListener('click', () => (recording ? stop() : start()));
  discardBtn.addEventListener('click', clearTake);

  render();

  return {
    stop,
    /** Enable recording only while the engine runs. */
    setEnabled(enabled) {
      recordBtn.disabled = !enabled;
    },
  };
}
