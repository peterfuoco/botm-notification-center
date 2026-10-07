import { insertDeliveries } from '../data/accountNotificationsRepo.js';
import { findAccountById } from '../data/accountsRepo.js';
import { listActiveEventNotifications } from '../data/notificationsRepo.js';
import { eventVisibleAt } from '../domain/eventVisibleAt.js';
import type { TriggerEventInput } from '../domain/validation/eventSchemas.js';
import { notFound } from '../lib/errors.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface TriggerEventResult {
  deliveriesCreated: number;
}

/**
 * Delivers every active EVENT notification for this event type to the account. Each distinct
 * eventId produces its own delivery (2 referrals → 2 notifications); replaying the same
 * eventId is a no-op via the dedupe key.
 *
 * Active notifications are read FOR SHARE in the same transaction as the insert, so this
 * serializes with deactivate: either deactivate commits first and we see it inactive, or it
 * waits for us and then cancels anything we created that is still pending.
 */
export async function triggerEvent(
  deps: ServiceDeps,
  event: TriggerEventInput,
): Promise<TriggerEventResult> {
  const now = deps.clock.now();
  const account = await findAccountById(deps.db, event.accountId);
  if (!account) throw notFound(`Account ${event.accountId} not found`);

  return deps.db.transaction().execute(async (trx) => {
    const notifications = await listActiveEventNotifications(trx, event.eventType, {
      lock: 'share',
    });
    const deliveriesCreated = await insertDeliveries(
      trx,
      notifications.map((notification) => ({
        notificationId: notification.id,
        accountId: event.accountId,
        visibleAt: eventVisibleAt(event, notification.delayDays),
        dedupeKey: event.eventId,
      })),
      now,
    );
    return { deliveriesCreated };
  });
}
