/**
 * Source of "now" for the whole app. Services and queries take time from here
 * (never `new Date()` or SQL `NOW()`) so tests can control time.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};
