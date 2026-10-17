import { describe, it, expect } from 'vitest';
import { parseRoute } from '../src/router.js';

describe('parseRoute', () => {
  it('maps known hashes to routes', () => {
    expect(parseRoute('#/autotune')).toBe('autotune');
    expect(parseRoute('#/dialekt')).toBe('dialekt');
    expect(parseRoute('#autotune')).toBe('autotune');
  });

  it('ignores extra path segments and query', () => {
    expect(parseRoute('#/autotune/settings')).toBe('autotune');
    expect(parseRoute('#/dialekt?x=1')).toBe('dialekt');
  });

  it('falls back to home for empty or unknown hashes', () => {
    expect(parseRoute('')).toBe('home');
    expect(parseRoute('#/')).toBe('home');
    expect(parseRoute('#/nope')).toBe('home');
    expect(parseRoute(undefined)).toBe('home');
  });
});
