// "Mina låtar": songs the user added, stored in this browser (IndexedDB).
// A song is { id, title, lrc, audio: Blob, audioName }. Nothing is uploaded.

const DB_NAME = 'autotune';
const STORE = 'songs';

let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

/** All songs without their audio, sorted by title (for the picker). */
export async function listSongs() {
  const songs = await run('readonly', (s) => s.getAll());
  return songs
    .map(({ id, title }) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'sv'));
}

export const getSong = (id) => run('readonly', (s) => s.get(id));

/** Insert or update; resolves to the song's id. */
export const saveSong = (song) => run('readwrite', (s) => s.put(song));

export const deleteSong = (id) => run('readwrite', (s) => s.delete(id));
