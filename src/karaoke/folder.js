// Client for the song folder on the computer running the dev server
// (tools/song-folder.js). On GitHub Pages there is no folder: every call
// reports it as unavailable and the app only uses this browser's songs.

const API = `${import.meta.env.BASE_URL}api/songs`;

/** Folder songs [{ id, title }], or null if there is no song folder. */
export async function listFolderSongs() {
  try {
    const res = await fetch(API, { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** A folder song in the same shape as a library song. */
export async function getFolderSong(id, title) {
  const [lrc, audio] = await Promise.all([
    fetch(`${API}/${id}/lrc`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : Promise.reject(r.status))),
    fetch(`${API}/${id}/audio`, { cache: 'no-store' }).then((r) => (r.ok ? r.blob() : Promise.reject(r.status))),
  ]);
  return { id, title, lrc, audio, folder: true };
}

/** "song.M4A" / "audio/mpeg" → "m4a" / "mp3". */
export function audioExtension(name, type) {
  const fromName = /\.([a-z0-9]+)$/i.exec(name ?? '')?.[1]?.toLowerCase();
  if (fromName && ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(fromName)) return fromName;
  const byType = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac' };
  return byType[type] ?? 'mp3';
}

async function put(url, body, type) {
  const res = await fetch(url, { method: 'PUT', body, headers: { 'Content-Type': type } });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
}

/** Save lyrics and (optionally) audio under `id`. */
export async function saveFolderSong(id, { lrc, audio, audioName }) {
  if (audio) {
    const ext = audioExtension(audioName, audio.type);
    await put(`${API}/${id}/audio?ext=${ext}`, audio, audio.type || 'application/octet-stream');
  }
  await put(`${API}/${id}/lrc`, lrc, 'text/plain; charset=utf-8');
}
