import { describe, it, expect } from 'vitest';
import { formatTime, takeFileName } from '../src/ui/recorder.js';

describe('recorder helpers', () => {
  it('formats durations as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.9)).toBe('0:09');
    expect(formatTime(75.4)).toBe('1:15');
    expect(formatTime(300)).toBe('5:00');
  });

  it('names takes by local date and time', () => {
    expect(takeFileName(new Date(2026, 9, 4, 18, 30))).toBe('autotune-2026-10-04-1830.wav');
    expect(takeFileName(new Date(2027, 0, 9, 7, 5))).toBe('autotune-2027-01-09-0705.wav');
  });
});
