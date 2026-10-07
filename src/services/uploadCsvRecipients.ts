import { insertDeliveriesForAccountIds } from '../data/accountNotificationsRepo.js';
import { findNotificationById } from '../data/notificationsRepo.js';
import {
  MAX_CSV_IDS,
  parseCsvAccountIds,
  type InvalidCsvLine,
} from '../domain/parseCsvAccountIds.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface UploadCsvResult {
  /** Valid, de-duplicated ids in the upload. */
  submitted: number;
  /** New deliveries created. */
  inserted: number;
  /** submitted - inserted: unknown account ids, or ids already uploaded for this notification. */
  skipped: number;
  duplicateCount: number;
  invalidLines: InvalidCsvLine[];
}

/**
 * Attaches a CSV of account ids to a CSV notification. Each account sees it at send_at (or now,
 * if send_at has already passed, so it doesn't read as sent in the past). Re-uploading is safe:
 * an account gets a given CSV notification at most once. CSV notifications are stored inactive,
 * so is_active is not checked; removed ones are rejected.
 */
export async function uploadCsvRecipients(
  deps: ServiceDeps,
  notificationId: number,
  csvText: string,
): Promise<UploadCsvResult> {
  const now = deps.clock.now();
  const notification = await findNotificationById(deps.db, notificationId);
  if (!notification) throw notFound(`Notification ${notificationId} not found`);
  if (notification.type !== 'CSV') {
    throw conflict(
      `Notification ${notificationId} is a ${notification.type} notification, not CSV`,
    );
  }
  if (notification.removedAt) throw conflict(`Notification ${notificationId} has been removed`);

  const parsed = parseCsvAccountIds(csvText);
  if (parsed.ids.length === 0) throw badRequest('CSV contains no valid account ids');
  if (parsed.ids.length > MAX_CSV_IDS) {
    throw badRequest(`CSV has ${parsed.ids.length} account ids; the limit is ${MAX_CSV_IDS}`);
  }

  const visibleAt = new Date(Math.max(notification.sendAt.getTime(), now.getTime()));
  const inserted = await insertDeliveriesForAccountIds(deps.db, {
    notificationId,
    accountIds: parsed.ids,
    visibleAt,
    dedupeKey: 'once',
    now,
  });

  return {
    submitted: parsed.ids.length,
    inserted,
    skipped: parsed.ids.length - inserted,
    duplicateCount: parsed.duplicateCount,
    invalidLines: parsed.invalidLines,
  };
}
