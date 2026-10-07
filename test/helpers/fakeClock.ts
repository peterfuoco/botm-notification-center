import type { Clock } from '../../src/lib/clock.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface FakeClock extends Clock {
  set(date: Date | string): void;
  advanceMs(ms: number): void;
  advanceDays(days: number): void;
}

/** Controllable clock for tests. Returns a fresh Date each call so callers can't mutate its state. */
export function createFakeClock(start: Date | string): FakeClock {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    set: (date) => {
      current = new Date(date).getTime();
    },
    advanceMs: (ms) => {
      current += ms;
    },
    advanceDays: (days) => {
      current += days * MS_PER_DAY;
    },
  };
}
