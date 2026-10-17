import { describe, it, expect } from 'vitest';
import { parseLrc, lineIndexAt, wordsSungAt, toLrc, formatTimeTag, hasTimeTags, parseKey } from '../src/karaoke/lrc.js';

const SONG = `[ti:Min låt]
[ar:Någon]
[key:Am]

[00:05.00]Första raden
[00:10.50][01:00.00]Refräng
[00:20.25]Sista raden
`;

describe('parseLrc', () => {
  it('reads metadata and sorted lines, repeating multi-tag lines', () => {
    const { meta, lines } = parseLrc(SONG);
    expect(meta).toEqual({ ti: 'Min låt', ar: 'Någon', key: 'Am' });
    expect(lines.map((l) => [l.time, l.text])).toEqual([
      [5, 'Första raden'],
      [10.5, 'Refräng'],
      [20.25, 'Sista raden'],
      [60, 'Refräng'],
    ]);
  });

  it('handles Windows line endings and mm:ss without decimals', () => {
    const { lines } = parseLrc('[01:02]Hej\r\n[1:03.5]Då\r\n');
    expect(lines.map((l) => l.time)).toEqual([62, 63.5]);
  });

  it('reads per-word times (enhanced LRC)', () => {
    const { lines } = parseLrc('[00:01.00]<00:01.00>Ett <00:01.50>två <00:02.00>tre');
    expect(lines[0].text).toBe('Ett två tre');
    expect(lines[0].words.map((w) => w.time)).toEqual([1, 1.5, 2]);
  });

  it('applies the offset tag (positive = earlier)', () => {
    const { lines } = parseLrc('[offset:+500]\n[00:10.00]Hej');
    expect(lines[0].time).toBeCloseTo(9.5);
  });

  it('ignores lines without times', () => {
    expect(parseLrc('bara text\n[00:01.00]Hej').lines).toHaveLength(1);
  });
});

describe('lineIndexAt', () => {
  const { lines } = parseLrc(SONG);
  it('finds the line being sung', () => {
    expect(lineIndexAt(lines, 0)).toBe(-1);
    expect(lineIndexAt(lines, 5)).toBe(0);
    expect(lineIndexAt(lines, 15)).toBe(1);
    expect(lineIndexAt(lines, 30)).toBe(2);
    expect(lineIndexAt(lines, 999)).toBe(3);
    expect(lineIndexAt([], 3)).toBe(-1);
  });
});

describe('wordsSungAt', () => {
  it('counts started words', () => {
    const { lines } = parseLrc('[00:01.00]<00:01.00>Ett <00:01.50>två');
    expect(wordsSungAt(lines[0], 0.5)).toBe(0);
    expect(wordsSungAt(lines[0], 1.2)).toBe(1);
    expect(wordsSungAt(lines[0], 9)).toBe(2);
    expect(wordsSungAt({ time: 0, text: 'x', words: null }, 9)).toBe(0);
  });
});

describe('toLrc', () => {
  it('round-trips through parseLrc', () => {
    const lines = [{ time: 3.456, text: 'Hej' }, { time: 65.1, text: 'Då' }];
    const text = toLrc(lines, { ti: 'Test', key: 'C' });
    expect(text).toBe('[ti:Test]\n[key:C]\n[00:03.46]Hej\n[01:05.10]Då\n');
    const parsed = parseLrc(text);
    expect(parsed.meta.key).toBe('C');
    expect(parsed.lines.map((l) => l.text)).toEqual(['Hej', 'Då']);
  });

  it('formats time tags', () => {
    expect(formatTimeTag(0)).toBe('00:00.00');
    expect(formatTimeTag(125.5)).toBe('02:05.50');
  });
});

describe('hasTimeTags', () => {
  it('tells LRC from plain lyrics', () => {
    expect(hasTimeTags('[00:01.00]Hej')).toBe(true);
    expect(hasTimeTags('Hej\nDå')).toBe(false);
    expect(hasTimeTags('[ti:Bara titel]')).toBe(false);
  });
});

describe('parseKey', () => {
  it('reads major and minor keys', () => {
    expect(parseKey('C')).toEqual({ key: 0, scale: 'major' });
    expect(parseKey('Am')).toEqual({ key: 9, scale: 'minor' });
    expect(parseKey('F#')).toEqual({ key: 6, scale: 'major' });
    expect(parseKey('Bb')).toEqual({ key: 10, scale: 'major' });
    expect(parseKey('C#m')).toEqual({ key: 1, scale: 'minor' });
    expect(parseKey('D minor')).toEqual({ key: 2, scale: 'minor' });
    expect(parseKey('H moll')).toEqual({ key: 11, scale: 'minor' });
    expect(parseKey('Cb')).toEqual({ key: 11, scale: 'major' });
  });

  it('rejects junk', () => {
    expect(parseKey('')).toBeNull();
    expect(parseKey('X')).toBeNull();
    expect(parseKey(undefined)).toBeNull();
  });
});
