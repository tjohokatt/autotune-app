// Karaoke: pick one of "Mina låtar", play its backing track and show the
// lyrics in time. Songs are added from the user's own files (audio + LRC or
// plain text) and kept in this browser. Plain text is timed with a tap-along
// editor that uses a plain <audio> element, so it works without the mic.

import { listSongs, getSong, saveSong, deleteSong } from '../karaoke/library.js';
import { parseLrc, lineIndexAt, wordsSungAt, toLrc, hasTimeTags, parseKey } from '../karaoke/lrc.js';

/** Plain lyric lines from either LRC or plain text (for the timing editor). */
export function plainLines(text) {
  // Repeated lines (choruses) stay repeated: each one is tapped in turn.
  if (hasTimeTags(text)) return parseLrc(text).lines.map((l) => l.text).filter(Boolean);
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[a-z]+:.*\]$/i.test(l));
}

/** Set or replace the [key:…] tag in LRC/plain text. */
export function withKeyTag(text, key) {
  const rest = text.replace(/^\[key:.*\]\s*\n?/im, '');
  return key ? `[key:${key}]\n${rest}` : rest;
}

/**
 * @param {HTMLElement} root
 * @param {object} cfg
 * @param {() => object|null} cfg.getEngine   the running engine, or null
 * @param {(k: {key:number, scale:string}) => void} cfg.onKey  song has a key
 * @param {(msg: string|null) => void} cfg.showMessage
 */
export function createKaraokeUI(root, { getEngine, onKey, showMessage }) {
  const $ = (sel) => root.querySelector(sel);
  const selectEl = $('#song-select');
  const addBtn = $('#song-add');
  const lyricsEl = $('#lyrics');
  const [prevEl, currentEl, nextEl] = lyricsEl.querySelectorAll('.lyric');
  const playBtn = $('#song-play');
  const songTools = $('#song-tools');
  const syncBtn = $('#song-sync');
  const deleteBtn = $('#song-delete');
  const volumeEl = $('#backing-volume');
  const statusEl = $('#song-status');
  const form = $('#song-form');
  const syncEl = $('#sync');

  let song = null; // the selected song (with audio)
  let parsed = null; // parseLrc(song.lrc)
  let playing = false;
  let frame = 0;
  let engineOn = false;

  // ---------- picker ----------

  async function refreshList(selectId = song?.id) {
    const songs = await listSongs();
    selectEl.replaceChildren(new Option('– Ingen låt –', ''));
    for (const s of songs) selectEl.add(new Option(s.title, String(s.id)));
    selectEl.value = selectId != null ? String(selectId) : '';
  }

  async function select(id) {
    stopSong();
    song = id ? await getSong(Number(id)) : null;
    parsed = song ? parseLrc(song.lrc) : null;
    if (song) {
      const key = parseKey(parsed.meta.key);
      if (key) onKey(key);
    }
    render();
  }

  function render() {
    const timed = parsed?.lines.length > 0;
    songTools.hidden = !song;
    lyricsEl.hidden = !song;
    playBtn.hidden = !song;
    playBtn.disabled = !engineOn || !timed;
    playBtn.textContent = playing ? '⏹ Stoppa låten' : '▶ Spela låten';
    playBtn.classList.toggle('running', playing);
    if (!song) statusEl.textContent = '';
    else if (!timed) statusEl.textContent = 'Texten har inga tider än. Tryck på ⏱️ Tidsätt texten.';
    else if (!engineOn) statusEl.textContent = 'Tryck på Starta högst upp först, sedan ▶ Spela låten.';
    else statusEl.textContent = '🎧 Sjung med hörlurar, annars hör mikrofonen musiken.';
    if (!playing) showLines(-1, 0);
  }

  // ---------- playback + lyrics ----------

  function showLines(i, t) {
    const lines = parsed?.lines ?? [];
    prevEl.textContent = lines[i - 1]?.text ?? '';
    nextEl.textContent = lines[i + 1]?.text ?? '';
    const line = lines[i];
    if (!line) {
      currentEl.textContent = lines.length ? (i < 0 ? '🎵 …' : '') : '';
      if (i < 0 && lines[0]) nextEl.textContent = lines[0].text;
      return;
    }
    if (line.words) {
      // Word-by-word fill: sung words get the "sung" class.
      const sung = wordsSungAt(line, t);
      currentEl.replaceChildren(
        ...line.words.map((w, k) => {
          const span = document.createElement('span');
          span.textContent = w.text;
          if (k < sung) span.className = 'sung';
          return span;
        }),
      );
    } else {
      currentEl.textContent = line.text;
    }
  }

  function tick() {
    const t = getEngine()?.backingTime();
    if (t == null) return;
    showLines(lineIndexAt(parsed.lines, t), t);
    frame = requestAnimationFrame(tick);
  }

  async function playSong() {
    const engine = getEngine();
    if (!engine || !song) return;
    showMessage(null);
    try {
      await engine.playBacking(song.audio, { onEnded: stopSong });
    } catch (err) {
      console.error(err);
      showMessage('Musikfilen gick inte att spela. Prova en mp3- eller m4a-fil.');
      return;
    }
    playing = true;
    render();
    frame = requestAnimationFrame(tick);
  }

  function stopSong() {
    cancelAnimationFrame(frame);
    getEngine()?.stopBacking();
    playing = false;
    render();
  }

  playBtn.addEventListener('click', () => (playing ? stopSong() : playSong()));
  selectEl.addEventListener('change', () => select(selectEl.value));
  volumeEl.addEventListener('input', () => getEngine()?.setBackingVolume(Number(volumeEl.value) / 100));

  deleteBtn.addEventListener('click', async () => {
    if (!song || !confirm(`Ta bort "${song.title}"?`)) return;
    await deleteSong(song.id);
    await refreshList(null);
    await select(null);
  });

  // ---------- add a song ----------

  addBtn.addEventListener('click', () => {
    stopSong();
    form.reset();
    form.hidden = false;
    form.querySelector('input').focus();
  });

  form.querySelector('#song-cancel').addEventListener('click', () => (form.hidden = true));

  form.querySelector('#song-lrc-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) form.querySelector('#song-lyrics').value = await file.text();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = form.querySelector('#song-title').value.trim();
    const audio = form.querySelector('#song-audio').files[0];
    const lyrics = form.querySelector('#song-lyrics').value.trim();
    const keyText = form.querySelector('#song-key').value.trim();
    if (!title || !audio || !lyrics) {
      showMessage('Fyll i namn, välj en musikfil och lägg till texten.');
      return;
    }
    if (keyText && !parseKey(keyText)) {
      showMessage('Tonarten förstod jag inte. Skriv t.ex. C, Am eller F#m, eller lämna tomt.');
      return;
    }
    showMessage(null);
    const lrc = keyText ? withKeyTag(lyrics, keyText) : lyrics;
    // Store the file as a plain Blob; some browsers can't keep File objects in IndexedDB.
    const blob = new Blob([await audio.arrayBuffer()], { type: audio.type });
    const id = await saveSong({ title, lrc, audio: blob, audioName: audio.name });
    form.hidden = true;
    await refreshList(id);
    await select(id);
    if (!hasTimeTags(lyrics)) startSync();
  });

  // ---------- tap-along timing editor ----------

  const syncAudio = syncEl.querySelector('audio');
  const syncLine = syncEl.querySelector('#sync-line');
  const syncNext = syncEl.querySelector('#sync-next');
  const syncProgress = syncEl.querySelector('#sync-progress');
  const syncTap = syncEl.querySelector('#sync-tap');
  let syncLines = [];
  let syncTimes = [];
  let syncUrl = null;

  function renderSync() {
    const i = syncTimes.length;
    syncLine.textContent = syncLines[i] ?? 'Klart! 🎉';
    syncNext.textContent = syncLines[i + 1] ?? '';
    syncProgress.textContent = `Rad ${Math.min(i + 1, syncLines.length)} av ${syncLines.length}`;
    syncTap.textContent = syncAudio.paused && i === 0 ? '▶ Starta musiken' : '👆 Nu!';
  }

  function startSync() {
    if (!song) return;
    stopSong();
    syncLines = plainLines(song.lrc);
    syncTimes = [];
    if (syncUrl) URL.revokeObjectURL(syncUrl);
    syncUrl = URL.createObjectURL(song.audio);
    syncAudio.src = syncUrl;
    syncEl.hidden = false;
    renderSync();
  }

  async function finishSync(save) {
    if (syncEl.hidden) return;
    syncAudio.pause();
    syncEl.hidden = true;
    if (save && syncTimes.length) {
      const lines = syncTimes.map((time, k) => ({ time, text: syncLines[k] }));
      const key = parsed?.meta.key;
      song.lrc = toLrc(lines, { ti: song.title, ...(key ? { key } : {}) });
      await saveSong(song);
      await select(song.id);
    }
  }

  syncTap.addEventListener('click', () => {
    if (syncAudio.paused && syncTimes.length === 0) {
      syncAudio.currentTime = 0;
      syncAudio.play();
    } else if (syncTimes.length < syncLines.length) {
      syncTimes.push(syncAudio.currentTime);
      if (syncTimes.length === syncLines.length) finishSync(true);
    }
    renderSync();
  });
  syncEl.querySelector('#sync-undo').addEventListener('click', () => {
    syncTimes.pop();
    renderSync();
  });
  syncEl.querySelector('#sync-done').addEventListener('click', () => finishSync(true));
  syncEl.querySelector('#sync-cancel').addEventListener('click', () => finishSync(false));
  syncAudio.addEventListener('ended', () => finishSync(true));
  syncBtn.addEventListener('click', startSync);

  refreshList().catch((err) => {
    console.error(err);
    root.hidden = true; // e.g. IndexedDB blocked in private mode
  });
  render();

  return {
    stop: stopSong,
    /** The backing track needs the running engine. */
    setEnabled(enabled) {
      engineOn = enabled;
      if (enabled) getEngine()?.setBackingVolume(Number(volumeEl.value) / 100);
      else stopSong();
      render();
    },
  };
}
