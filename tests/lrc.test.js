import { describe, it, expect } from 'vitest';
import {
  parseLrc,
  lineIndexAt,
  wordFills,
  tapsToTimes,
  offsetOf,
  withOffset,
  REACTION_S,
  toLrc, formatTimeTag, hasTimeTags, parseKey } from '../src/karaoke/lrc.js';

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

describe('wordFills', () => {
  const fills = (lines, i, t) => wordFills(lines, i, t).map((w) => Math.round(w.fill * 100) / 100);

  it('fills per-word lines word by word', () => {
    const { lines } = parseLrc('[00:01.00]<00:01.00>Hej <00:02.00>då\n[00:04.00]Nästa');
    expect(fills(lines, 0, 0.5)).toEqual([0, 0]);
    expect(fills(lines, 0, 1.5)).toEqual([0.5, 0]);
    expect(fills(lines, 0, 2.5)).toEqual([1, 0.5]);
    expect(wordFills(lines, 0, 1).map((w) => w.text)).toEqual(['Hej ', 'då']);
  });

  it('fills plain lines character by character up to the estimated end', () => {
    // Two words: estimated 1 s long (minimum), next line far away.
    const { lines } = parseLrc('[00:10.00]ab cd\n[00:30.00]x');
    expect(fills(lines, 0, 9)).toEqual([0, 0]);
    expect(fills(lines, 0, 10.25)).toEqual([0.5, 0]);
    expect(fills(lines, 0, 10.75)).toEqual([1, 0.5]);
    expect(fills(lines, 0, 20)).toEqual([1, 1]);
    expect(wordFills(lines, 0, 10).map((w) => w.text)).toEqual(['ab ', 'cd']);
  });

  it('finishes a plain line before the next one starts', () => {
    const { lines } = parseLrc('[00:10.00]a b c d e f g h\n[00:11.10]x');
    expect(fills(lines, 0, 11)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('timing helpers', () => {
  it('moves taps earlier by the reaction time, not below 0', () => {
    expect(tapsToTimes([0.1, 5])).toEqual([0, 5 - REACTION_S]);
  });

  it('reads, sets and removes the [offset:] tag', () => {
    const lrc = '[ti:Låt]\n[00:01.00]Hej\n';
    expect(offsetOf(lrc)).toBe(0);
    const earlier = withOffset(lrc, 400);
    expect(offsetOf(earlier)).toBe(400);
    expect(parseLrc(earlier).lines[0].time).toBeCloseTo(0.6);
    expect(offsetOf(withOffset(earlier, -200))).toBe(-200);
    expect(withOffset(earlier, 0)).toBe(lrc);
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
