import type { Db } from '../data/database.js';
import { findNotificationById } from '../data/notificationsRepo.js';
import type { Notification } from '../domain/types.js';
import { conflict, notFound } from '../lib/errors.js';

/**
 * Loads a notification with a FOR UPDATE lock for an admin state change. Throws 404 if missing
 * and 409 if removed (removed is permanent). Call inside a transaction.
 */
export async function loadNotificationForChange(trx: Db, id: number): Promise<Notification> {
  const notification = await findNotificationById(trx, id, { lock: 'update' });
  if (!notification) throw notFound(`Notification ${id} not found`);
  if (notification.removedAt) throw conflict(`Notification ${id} has been removed`);
  return notification;
}
