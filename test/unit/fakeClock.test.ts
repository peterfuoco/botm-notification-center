import { describe, expect, it } from 'vitest';
import { createFakeClock } from '../helpers/fakeClock.js';

describe('createFakeClock', () => {
  it('starts at the given time and advances by days across a month boundary', () => {
    const clock = createFakeClock('2026-08-29T12:00:00Z');
    clock.advanceDays(5);
    expect(clock.now().toISOString()).toBe('2026-09-03T12:00:00.000Z');
  });

  it('returns a copy so callers cannot mutate the clock', () => {
    const clock = createFakeClock('2026-10-01T00:00:00Z');
    clock.now().setUTCFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('can be set to an absolute time', () => {
    const clock = createFakeClock('2026-10-01T00:00:00Z');
    clock.set('2027-01-15T08:30:00Z');
    expect(clock.now().toISOString()).toBe('2027-01-15T08:30:00.000Z');
  });
});
