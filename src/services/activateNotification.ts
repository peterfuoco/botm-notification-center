import { findNotificationById, setNotificationActive } from '../data/notificationsRepo.js';
import type { Notification } from '../domain/types.js';
import { conflict } from '../lib/errors.js';
import { loadNotificationForChange } from './loadNotificationForChange.js';
import { sweepFilterNotification } from './runFilterSweep.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface ActivateResult {
  notification: Notification;
  deliveriesCreated: number;
}

/**
 * Makes an EVENT or FILTER notification live. A FILTER notification is swept immediately so
 * currently-eligible accounts get it now rather than at the next cron run. Idempotent.
 */
export async function activateNotification(deps: ServiceDeps, id: number): Promise<ActivateResult> {
  const now = deps.clock.now();
  return deps.db.transaction().execute(async (trx) => {
    const current = await loadNotificationForChange(trx, id);
    if (current.type === 'CSV') {
      throw conflict('CSV notifications are one-time sends and cannot be activated');
    }

    await setNotificationActive(trx, id, true, now);
    const deliveriesCreated =
      current.type === 'FILTER' ? await sweepFilterNotification(trx, current, now) : 0;

    const notification = await findNotificationById(trx, id);
    if (!notification) throw new Error(`Notification ${id} disappeared during activate`);
    return { notification, deliveriesCreated };
  });
}
