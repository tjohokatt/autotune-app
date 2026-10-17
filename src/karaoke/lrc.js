// LRC timed lyrics: parse, look up the current line, write back.
// Pure functions, no DOM.
//
//   [ti:Song title]          metadata tags (ti, ar, offset, key …)
//   [key:Am]                 our own tag: the song's key, used by autotune
//   [00:12.40]Line of text   a line starts at 12.4 s
//   [00:12.40][01:30.00]Hi   the same line at two times (choruses)
//   [00:12.40]<00:12.40>One <00:12.90>two   "enhanced" LRC: per-word times

import { NOTE_NAMES } from '../dsp/notes.js';

const TIME_TAG = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;
const META_TAG = /^\[([a-z]+):(.*)\]\s*$/i;

function toSeconds(min, sec) {
  return Number(min) * 60 + Number(sec.replace(':', '.'));
}

/** "1:02.5" style for writing; always mm:ss.xx. */
export function formatTimeTag(seconds) {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function parseWords(text) {
  const parts = [...text.matchAll(WORD_TAG)];
  if (!parts.length) return null;
  return parts.map((m, i) => {
    const end = i + 1 < parts.length ? parts[i + 1].index : text.length;
    return { time: toSeconds(m[1], m[2]), text: text.slice(m.index + m[0].length, end) };
  }).filter((w) => w.text.trim());
}

/**
 * @returns {{ meta: Record<string,string>, lines: {time:number, text:string, words: {time:number,text:string}[]|null}[] }}
 * Lines are sorted by time. Lines without any time tag are ignored.
 */
export function parseLrc(source) {
  const meta = {};
  const lines = [];
  for (const raw of source.split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    const times = [...row.matchAll(TIME_TAG)];
    if (!times.length) {
      const m = row.match(META_TAG);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    const body = row.slice(times.at(-1).index + times.at(-1)[0].length);
    const words = parseWords(body);
    const text = words ? words.map((w) => w.text).join('').trim() : body.trim();
    for (const t of times) lines.push({ time: toSeconds(t[1], t[2]), text, words });
  }
  // [offset:+500] means lyrics are shown 0.5 s earlier.
  const offset = Number(meta.offset) / 1000 || 0;
  for (const line of lines) {
    line.time -= offset;
    if (line.words) line.words = line.words.map((w) => ({ ...w, time: w.time - offset }));
  }
  lines.sort((a, b) => a.time - b.time);
  return { meta, lines };
}

/** Index of the line being sung at time t, or -1 before the first line. */
export function lineIndexAt(lines, t) {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** Number of words in `line` that have started at time t. */
export function wordsSungAt(line, t) {
  if (!line?.words) return 0;
  let n = 0;
  while (n < line.words.length && line.words[n].time <= t) n++;
  return n;
}

/** Write lines (and optional metadata) as LRC text. */
export function toLrc(lines, meta = {}) {
  const head = Object.entries(meta)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `[${k}:${v}]`);
  const body = lines.map((l) => `[${formatTimeTag(l.time)}]${l.text}`);
  return [...head, ...body].join('\n') + '\n';
}

/** True if the text has at least one [mm:ss] time tag. */
export function hasTimeTags(text) {
  return new RegExp(TIME_TAG.source).test(text);
}

/**
 * Parse a key tag like "C", "F#", "Bb", "Am", "C#m", "D minor", "H moll" into the
 * autotune settings { key: 0–11, scale: 'major'|'minor' }, or null.
 */
export function parseKey(tag) {
  const m = String(tag ?? '').trim().match(/^([A-Ha-h])([#♯b♭]?)\s*(m|min|minor|moll|maj|major|dur)?$/i);
  if (!m) return null;
  // Swedish "H" is the international "B".
  const letter = m[1].toUpperCase() === 'H' ? 'B' : m[1].toUpperCase();
  let key = NOTE_NAMES.indexOf(letter);
  if (key < 0) return null;
  if (m[2] === '#' || m[2] === '♯') key += 1;
  if (m[2] === 'b' || m[2] === '♭') key -= 1;
  const quality = (m[3] ?? '').toLowerCase();
  const minor = quality === 'm' || quality === 'min' || quality === 'minor' || quality === 'moll';
  return { key: (key + 12) % 12, scale: minor ? 'minor' : 'major' };
}
