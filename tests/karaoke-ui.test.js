import { describe, it, expect } from 'vitest';
import { plainLines, withKeyTag } from '../src/ui/karaoke.js';

describe('plainLines', () => {
  it('splits plain lyrics and drops blank lines and metadata', () => {
    expect(plainLines('[ti:Låt]\nRad ett\n\n  Rad två  \n')).toEqual(['Rad ett', 'Rad två']);
  });

  it('takes the lines from LRC in time order, repeats included', () => {
    expect(plainLines('[00:01.00][00:09.00]Refräng\n[00:05.00]Vers')).toEqual(['Refräng', 'Vers', 'Refräng']);
  });
});

describe('withKeyTag', () => {
  it('adds or replaces the key tag', () => {
    expect(withKeyTag('Rad', 'Am')).toBe('[key:Am]\nRad');
    expect(withKeyTag('[key:C]\nRad', 'Am')).toBe('[key:Am]\nRad');
    expect(withKeyTag('[key:C]\nRad', '')).toBe('Rad');
  });
});
