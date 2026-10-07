import {
  findNotificationById,
  updateNotification as updateRow,
} from '../data/notificationsRepo.js';
import type { Notification, NotificationType } from '../domain/types.js';
import type { UpdateNotificationInput } from '../domain/validation/notificationSchemas.js';
import { badRequest } from '../lib/errors.js';
import { loadNotificationForChange } from './loadNotificationForChange.js';
import type { ServiceDeps } from './serviceDeps.js';

type UpdateField = keyof UpdateNotificationInput;

const TYPE_SPECIFIC_FIELDS: Record<NotificationType, readonly UpdateField[]> = {
  EVENT: ['delayDays'],
  FILTER: ['policies', 'relationshipStatuses', 'countries', 'minCredits', 'maxCredits'],
  CSV: [],
};
const CONTENT_FIELDS: readonly UpdateField[] = ['iconUrl', 'headline', 'subheadline', 'linkPath'];

/**
 * Edits a notification. Content edits show on already-delivered copies (deliveries reference
 * the notification); filter and delay edits only affect future sends.
 */
export async function updateNotification(
  deps: ServiceDeps,
  id: number,
  patch: UpdateNotificationInput,
): Promise<Notification> {
  const now = deps.clock.now();
  return deps.db.transaction().execute(async (trx) => {
    const current = await loadNotificationForChange(trx, id);

    const allowed = new Set([...CONTENT_FIELDS, ...TYPE_SPECIFIC_FIELDS[current.type]]);
    const invalid = (Object.keys(patch) as UpdateField[]).filter((field) => !allowed.has(field));
    if (invalid.length > 0) {
      throw badRequest(`Not editable on a ${current.type} notification: ${invalid.join(', ')}`);
    }

    if (current.type === 'FILTER') {
      const min = patch.minCredits !== undefined ? patch.minCredits : current.filter.minCredits;
      const max = patch.maxCredits !== undefined ? patch.maxCredits : current.filter.maxCredits;
      if (min !== null && max !== null && min > max) {
        throw badRequest(`minCredits (${min}) must be less than or equal to maxCredits (${max})`);
      }
    }

    await updateRow(trx, id, patch, now);
    const updated = await findNotificationById(trx, id);
    if (!updated) throw new Error(`Notification ${id} disappeared during update`);
    return updated;
  });
}
