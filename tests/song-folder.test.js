import { describe, it, expect } from 'vitest';
import { slugify, isValidId, lrcTitle, pairSongs } from '../tools/song-folder.js';
import { folderId } from '../src/ui/karaoke.js';
import { audioExtension } from '../src/karaoke/folder.js';

describe('song folder (server side)', () => {
  it('slugifies titles into safe file names', () => {
    expect(slugify('Min Låt!')).toBe('min-lat');
    expect(slugify('Ögon & Öron')).toBe('ogon-oron');
    expect(slugify('../../etc')).toBe('etc');
    expect(slugify('???')).toBe('lat');
  });

  it('only accepts safe ids', () => {
    expect(isValidId('min-lat-2')).toBe(true);
    expect(isValidId('../x')).toBe(false);
    expect(isValidId('-x')).toBe(false);
    expect(isValidId('')).toBe(false);
  });

  it('reads the title tag', () => {
    expect(lrcTitle('[ti: Debut ]\n[00:01.00]x')).toBe('Debut');
    expect(lrcTitle('bara text')).toBeNull();
  });

  it('pairs lyrics with audio of the same name', () => {
    expect(pairSongs(['b.lrc', 'b.M4A', 'a.lrc', 'a.mp3', 'c.lrc', 'd.mp3', 'notes.txt'])).toEqual([
      { id: 'a', audio: 'a.mp3' },
      { id: 'b', audio: 'b.M4A' },
    ]);
  });
});

describe('song folder (client side)', () => {
  it('makes unique ids for new songs', () => {
    expect(folderId('Min Låt', [])).toBe('min-lat');
    expect(folderId('Min Låt', ['min-lat', 'min-lat-2'])).toBe('min-lat-3');
  });

  it('picks the audio file extension', () => {
    expect(audioExtension('song.M4A', 'audio/mp4')).toBe('m4a');
    expect(audioExtension('song', 'audio/mpeg')).toBe('mp3');
    expect(audioExtension(undefined, '')).toBe('mp3');
  });
});
