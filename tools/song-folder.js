// Vite plugin: a "låtmapp" (song folder) on the computer that runs the dev
// server, so a song added on the PC shows up on the phone on the same Wi-Fi.
//
// Folder: <repo>/songs/ (git-ignored – songs are copyrighted and private).
// A song is two files with the same base name:
//   min-lat.lrc   lyrics (LRC or plain text; [ti:…] gives the title)
//   min-lat.mp3   backing track (mp3, m4a, aac, wav, ogg, flac)
// You can also drop files in by hand.
//
// API (dev and preview server only; there is nothing on GitHub Pages):
//   GET  <base>api/songs              → [{ id, title, audio }]
//   GET  <base>api/songs/<id>/lrc     → lyrics text
//   GET  <base>api/songs/<id>/audio   → audio file
//   PUT  <base>api/songs/<id>/lrc     body: lyrics text
//   PUT  <base>api/songs/<id>/audio?ext=mp3   body: audio bytes

import fs from 'node:fs';
import path from 'node:path';

export const AUDIO_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};
const MAX_BYTES = 60 * 1024 * 1024;

/** File-name-safe id from a title: "Min Låt!" → "min-lat". */
export function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // å → a, ö → o …
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'lat'
  );
}

export const isValidId = (id) => /^[a-z0-9][a-z0-9-]{0,59}$/.test(id);

/** Title from an LRC [ti:] tag, else null. */
export function lrcTitle(text) {
  return text.match(/^\s*\[ti:(.*)\]\s*$/im)?.[1].trim() || null;
}

/**
 * Pair .lrc files with audio files of the same base name.
 * @param {string[]} files  file names in the folder
 * @returns {{ id: string, audio: string }[]}
 */
export function pairSongs(files) {
  const audioByBase = new Map();
  for (const f of files) {
    const ext = path.extname(f).slice(1).toLowerCase();
    if (AUDIO_TYPES[ext]) audioByBase.set(path.basename(f, path.extname(f)), f);
  }
  return files
    .filter((f) => path.extname(f).toLowerCase() === '.lrc')
    .map((f) => path.basename(f, path.extname(f)))
    .filter((base) => audioByBase.has(base) && isValidId(base))
    .map((id) => ({ id, audio: audioByBase.get(id) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function middleware(dir, base) {
  const prefix = `${base}api/songs`;
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(prefix)) return next();
    const [id, kind] = url.pathname.slice(prefix.length).split('/').filter(Boolean);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const files = fs.readdirSync(dir);

      if (!id && req.method === 'GET') {
        const songs = pairSongs(files).map(({ id: songId, audio }) => {
          const lrc = fs.readFileSync(path.join(dir, `${songId}.lrc`), 'utf8');
          return { id: songId, title: lrcTitle(lrc) ?? songId, audio };
        });
        return send(res, 200, songs);
      }
      if (!isValidId(id ?? '') || !['lrc', 'audio'].includes(kind)) return send(res, 404, { error: 'not found' });

      if (req.method === 'GET' && kind === 'lrc') {
        return send(res, 200, fs.readFileSync(path.join(dir, `${id}.lrc`)), 'text/plain; charset=utf-8');
      }
      if (req.method === 'GET' && kind === 'audio') {
        const song = pairSongs(files).find((s) => s.id === id);
        if (!song) return send(res, 404, { error: 'not found' });
        const ext = path.extname(song.audio).slice(1).toLowerCase();
        return send(res, 200, fs.readFileSync(path.join(dir, song.audio)), AUDIO_TYPES[ext]);
      }
      if (req.method === 'PUT' && kind === 'lrc') {
        fs.writeFileSync(path.join(dir, `${id}.lrc`), await readBody(req));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'PUT' && kind === 'audio') {
        const ext = (url.searchParams.get('ext') ?? '').toLowerCase();
        if (!AUDIO_TYPES[ext]) return send(res, 400, { error: 'unsupported audio type' });
        // One audio file per song: remove one with another extension.
        for (const f of files) {
          if (path.basename(f, path.extname(f)) === id && AUDIO_TYPES[path.extname(f).slice(1).toLowerCase()]) {
            fs.rmSync(path.join(dir, f));
          }
        }
        fs.writeFileSync(path.join(dir, `${id}.${ext}`), await readBody(req));
        return send(res, 200, { ok: true });
      }
      return send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      if (err.code === 'ENOENT') return send(res, 404, { error: 'not found' });
      return send(res, 500, { error: String(err.message ?? err) });
    }
  };
}

export function songFolder({ dir = 'songs' } = {}) {
  let root;
  let base = '/';
  return {
    name: 'song-folder',
    configResolved(config) {
      root = path.resolve(config.root, dir);
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use(middleware(root, base));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(root, base));
    },
  };
}
