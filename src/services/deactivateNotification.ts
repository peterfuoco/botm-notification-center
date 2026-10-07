import { deletePendingDeliveries } from '../data/accountNotificationsRepo.js';
import { findNotificationById, setNotificationActive } from '../data/notificationsRepo.js';
import type { Notification } from '../domain/types.js';
import { conflict } from '../lib/errors.js';
import { loadNotificationForChange } from './loadNotificationForChange.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface DeactivateResult {
  notification: Notification;
  pendingCancelled: number;
}

/**
 * Stops new sends. Deliveries already visible stay; pending ones (future visible_at from a
 * delay or audiobook date) are cancelled. One transaction holding the row lock, so an event
 * trigger (which reads FOR SHARE) can't slip a delivery in between the two steps.
 */
export async function deactivateNotification(
  deps: ServiceDeps,
  id: number,
): Promise<DeactivateResult> {
  const now = deps.clock.now();
  return deps.db.transaction().execute(async (trx) => {
    const current = await loadNotificationForChange(trx, id);
    if (current.type === 'CSV') {
      throw conflict('CSV notifications are one-time sends and cannot be deactivated');
    }

    await setNotificationActive(trx, id, false, now);
    const pendingCancelled = await deletePendingDeliveries(trx, id, now);

    const notification = await findNotificationById(trx, id);
    if (!notification) throw new Error(`Notification ${id} disappeared during deactivate`);
    return { notification, pendingCancelled };
  });
}
