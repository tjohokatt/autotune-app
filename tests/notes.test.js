import { describe, it, expect } from 'vitest';
import { freqToMidi, midiToFreq, noteName, describePitch } from '../src/dsp/notes.js';

describe('notes', () => {
  it('maps A4 = 440 Hz to MIDI 69 and back', () => {
    expect(freqToMidi(440)).toBe(69);
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
  });

  it('names notes with octave numbers (MIDI 60 = C4)', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(69)).toBe('A4');
    expect(noteName(61)).toBe('C#4');
    expect(noteName(71)).toBe('B4');
    expect(noteName(72)).toBe('C5');
    expect(noteName(21)).toBe('A0');
  });

  it('describes in-tune pitches', () => {
    const p = describePitch(523.25);
    expect(p.name).toBe('C5');
    expect(Math.abs(p.cents)).toBeLessThan(1);
  });

  it('reports sharp and flat in cents', () => {
    const sharp = describePitch(452);
    expect(sharp.name).toBe('A4');
    expect(sharp.cents).toBeCloseTo(46.6, 0);

    const flat = describePitch(430);
    expect(flat.name).toBe('A4');
    expect(flat.cents).toBeCloseTo(-39.8, 0);
  });

  it('rounds to the next note past 50 cents', () => {
    expect(describePitch(455).name).toBe('A#4');
  });
});
