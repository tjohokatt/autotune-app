// Karaoke: pick a song, play its backing track and show the lyrics in time.
// Songs are added from the user's own files (audio + LRC or plain text). They
// go to the song folder on the computer running the dev server when there is
// one (so phones on the LAN see them too), otherwise to this browser.
// Plain text is timed with a tap-along editor that uses a plain <audio>
// element, so it works without the mic.

import { listSongs, getSong, saveSong, deleteSong } from '../karaoke/library.js';
import { listFolderSongs, getFolderSong, saveFolderSong } from '../karaoke/folder.js';
import {
  parseLrc,
  lineIndexAt,
  wordFills,
  toLrc,
  hasTimeTags,
  parseKey,
  tapsToTimes,
  offsetOf,
  withOffset,
  LEAD_S,
} from '../karaoke/lrc.js';

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

/** Folder id for a new song: slug of the title, made unique among `taken`. */
export function folderId(title, taken) {
  const base =
    title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'lat';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
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
  const uploadBtn = $('#song-upload');
  const earlierBtn = $('#lyrics-earlier');
  const laterBtn = $('#lyrics-later');
  const offsetEl = $('#lyrics-offset');
  const volumeEl = $('#backing-volume');
  const statusEl = $('#song-status');
  const form = $('#song-form');
  const syncEl = $('#sync');

  let song = null; // the selected song (with audio); song.folder marks folder songs
  let folderSongs = null; // [{ id, title }] in the computer's song folder, or null if none
  let parsed = null; // parseLrc(song.lrc)
  let playing = false;
  let frame = 0;
  let engineOn = false;

  // ---------- picker ----------

  // Picker values: "folder:<id>" for folder songs, "db:<id>" for this browser's.
  const valueOf = (s) => (s ? (s.folder ? `folder:${s.id}` : `db:${s.id}`) : '');

  function group(label, songs, prefix) {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const s of songs) g.append(new Option(s.title, `${prefix}:${s.id}`));
    return g;
  }

  async function refreshList(selectValue = valueOf(song)) {
    const [local, folder] = await Promise.all([listSongs().catch(() => []), listFolderSongs()]);
    folderSongs = folder;
    selectEl.replaceChildren(new Option('– Ingen låt –', ''));
    if (folder?.length) selectEl.append(group('💻 På datorn', folder, 'folder'));
    if (local.length) selectEl.append(group('📱 Bara i den här webbläsaren', local, 'db'));
    selectEl.value = selectValue;
    if (selectEl.value !== selectValue) selectEl.value = '';
  }

  async function loadSong(value) {
    const [kind, id] = value.split(/:(.*)/s);
    if (kind === 'folder') {
      const title = folderSongs?.find((s) => s.id === id)?.title ?? id;
      return getFolderSong(id, title);
    }
    if (kind === 'db') return getSong(Number(id));
    return null;
  }

  async function select(value) {
    stopSong();
    showMessage(null);
    try {
      song = value ? await loadSong(value) : null;
    } catch (err) {
      console.error(err);
      song = null;
      showMessage('Låten gick inte att hämta från datorn. Är utvecklingsservern igång?');
    }
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
    // Folder songs are removed by deleting the files on the computer.
    deleteBtn.hidden = !song || song.folder;
    uploadBtn.hidden = !song || song.folder || folderSongs === null;
    lyricsEl.hidden = !song;
    const offset = song ? offsetOf(song.lrc) / 1000 : 0;
    earlierBtn.disabled = laterBtn.disabled = !timed;
    offsetEl.textContent = offset
      ? `Texten visas ${Math.abs(offset).toFixed(1).replace('.', ',')} s ${offset > 0 ? 'tidigare' : 'senare'}`
      : '';
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
    // Karaoke fill: each word gets a --fill of 0–100 % (see .lyric.current span).
    currentEl.replaceChildren(
      ...wordFills(lines, i, t).map(({ text, fill }) => {
        const span = document.createElement('span');
        span.textContent = text;
        span.style.setProperty('--fill', `${(fill * 100).toFixed(1)}%`);
        return span;
      }),
    );
  }

  function tick() {
    const t = getEngine()?.backingTime();
    if (t == null) return;
    // The line shows up LEAD_S early; its words fill from the real start.
    showLines(lineIndexAt(parsed.lines, t + LEAD_S), t);
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

  /** Move the lyrics by `ms` (positive = earlier) and save it with the song. */
  async function shiftLyrics(ms) {
    if (!song) return;
    song.lrc = withOffset(song.lrc, offsetOf(song.lrc) + ms);
    parsed = parseLrc(song.lrc);
    render();
    try {
      if (song.folder) await saveFolderSong(song.id, { lrc: song.lrc });
      else await saveSong(song);
    } catch (err) {
      console.error(err);
      showMessage('Det gick inte att spara tidsjusteringen.');
    }
  }
  earlierBtn.addEventListener('click', () => shiftLyrics(200));
  laterBtn.addEventListener('click', () => shiftLyrics(-200));

  deleteBtn.addEventListener('click', async () => {
    if (!song || song.folder || !confirm(`Ta bort "${song.title}"?`)) return;
    await deleteSong(song.id);
    await refreshList('');
    await select('');
  });

  /** Save a song to the computer's song folder; resolves to its picker value. */
  async function saveToFolder({ title, lrc, audio, audioName }) {
    const id = folderId(title, (folderSongs ?? []).map((s) => s.id));
    // The folder takes the title from the LRC's [ti:] tag.
    const withTitle = /^\s*\[ti:/im.test(lrc) ? lrc : `[ti:${title}]\n${lrc}`;
    await saveFolderSong(id, { lrc: withTitle, audio, audioName });
    return `folder:${id}`;
  }

  uploadBtn.addEventListener('click', async () => {
    if (!song || song.folder) return;
    showMessage(null);
    try {
      const value = await saveToFolder(song);
      await refreshList(value);
      await select(value);
    } catch (err) {
      console.error(err);
      showMessage('Det gick inte att spara låten på datorn.');
    }
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
    const newSong = { title, lrc, audio: blob, audioName: audio.name };
    let value;
    try {
      // Prefer the computer's song folder so phones see the song too.
      value = folderSongs !== null ? await saveToFolder(newSong) : `db:${await saveSong(newSong)}`;
    } catch (err) {
      console.error(err);
      showMessage('Det gick inte att spara låten.');
      return;
    }
    form.hidden = true;
    await refreshList(value);
    await select(value);
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
      const lines = tapsToTimes(syncTimes).map((time, k) => ({ time, text: syncLines[k] }));
      const key = parsed?.meta.key;
      song.lrc = toLrc(lines, { ti: song.title, ...(key ? { key } : {}) });
      try {
        if (song.folder) await saveFolderSong(song.id, { lrc: song.lrc });
        else await saveSong(song);
      } catch (err) {
        console.error(err);
        showMessage('Det gick inte att spara tiderna.');
      }
      await select(valueOf(song));
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

  refreshList();
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
