import type { Db } from '../data/database.js';
import type { Clock } from '../lib/clock.js';

/** What every service needs. Services read `now` from the clock once per call. */
export interface ServiceDeps {
  db: Db;
  clock: Clock;
}
