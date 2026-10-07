import { insertDeliveriesForFilter } from '../data/accountNotificationsRepo.js';
import type { Db } from '../data/database.js';
import { findNotificationById, listActiveFilterNotifications } from '../data/notificationsRepo.js';
import { monthKey } from '../domain/monthKey.js';
import type { FilterNotification } from '../domain/types.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface FilterSweepResult {
  notificationsSwept: number;
  deliveriesCreated: number;
}

/**
 * Sends one FILTER notification to every matching account that hasn't had it this UTC month.
 * The caller must hold a lock on the notification row (activate holds FOR UPDATE).
 */
export async function sweepFilterNotification(
  db: Db,
  notification: FilterNotification,
  now: Date,
): Promise<number> {
  return insertDeliveriesForFilter(db, {
    notificationId: notification.id,
    filter: notification.filter,
    visibleAt: now,
    dedupeKey: monthKey(now),
    now,
  });
}

/**
 * Sweeps every active, non-removed FILTER notification. Would run on a cron in production;
 * here it's called from tests and the admin maintenance endpoint. Each notification is
 * re-read FOR SHARE in its own transaction so a concurrent deactivate/remove either wins
 * (sweep skips it) or waits for the sweep to commit.
 */
export async function runFilterSweep(deps: ServiceDeps): Promise<FilterSweepResult> {
  const now = deps.clock.now();
  const candidates = await listActiveFilterNotifications(deps.db);

  let notificationsSwept = 0;
  let deliveriesCreated = 0;
  for (const candidate of candidates) {
    const created = await deps.db.transaction().execute(async (trx) => {
      const current = await findNotificationById(trx, candidate.id, { lock: 'share' });
      if (current?.type !== 'FILTER' || !current.isActive || current.removedAt) return null;
      return sweepFilterNotification(trx, current, now);
    });
    if (created === null) continue;
    notificationsSwept += 1;
    deliveriesCreated += created;
  }
  return { notificationsSwept, deliveriesCreated };
}
