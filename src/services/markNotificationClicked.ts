import { findDeliveryById, markDeliveryClicked } from '../data/accountNotificationsRepo.js';
import { findNotificationById } from '../data/notificationsRepo.js';
import { notFound } from '../lib/errors.js';
import type { ServiceDeps } from './serviceDeps.js';

/**
 * Marks one of the member's own, visible notifications as clicked. Idempotent: the first click
 * time is kept. Anything the member can't see in their feed (someone else's, not live yet,
 * removed, or unknown) is a 404 so ids can't be probed.
 */
export async function markNotificationClicked(
  deps: ServiceDeps,
  accountId: number,
  deliveryId: number,
): Promise<void> {
  const now = deps.clock.now();
  const missing = notFound(`Notification ${deliveryId} not found`);

  const delivery = await findDeliveryById(deps.db, deliveryId);
  if (!delivery || delivery.accountId !== accountId) throw missing;

  const notification = await findNotificationById(deps.db, delivery.notificationId);
  if (!notification || notification.removedAt) throw missing;

  const marked = await markDeliveryClicked(deps.db, { id: deliveryId, accountId, now });
  if (!marked) throw missing;
}
