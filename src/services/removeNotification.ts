import { findNotificationById, markNotificationRemoved } from '../data/notificationsRepo.js';
import type { Notification } from '../domain/types.js';
import { notFound } from '../lib/errors.js';
import type { ServiceDeps } from './serviceDeps.js';

/**
 * Removes a notification from the app for everyone, including people who already saw it.
 * Permanent and idempotent; also deactivates it so nothing new is sent.
 */
export async function removeNotification(deps: ServiceDeps, id: number): Promise<Notification> {
  const now = deps.clock.now();
  return deps.db.transaction().execute(async (trx) => {
    const current = await findNotificationById(trx, id, { lock: 'update' });
    if (!current) throw notFound(`Notification ${id} not found`);

    await markNotificationRemoved(trx, id, now);
    const removed = await findNotificationById(trx, id);
    if (!removed) throw new Error(`Notification ${id} disappeared during remove`);
    return removed;
  });
}
