import type { EventType } from './types.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type TriggeredEvent =
  | { eventType: 'AUDIOBOOK_PREORDER'; occurredAt: Date; publicationDate: Date }
  | { eventType: Exclude<EventType, 'AUDIOBOOK_PREORDER'>; occurredAt: Date };

/**
 * When an EVENT notification goes live for a triggered event.
 * - AUDIOBOOK_PREORDER: the publication date (delay ignored). If that date already passed,
 *   use occurredAt so a new notification doesn't read as "sent days ago".
 * - Others: occurredAt + delayDays (null/0 = immediately).
 */
export function eventVisibleAt(event: TriggeredEvent, delayDays: number | null): Date {
  if (event.eventType === 'AUDIOBOOK_PREORDER') {
    return new Date(Math.max(event.publicationDate.getTime(), event.occurredAt.getTime()));
  }
  return new Date(event.occurredAt.getTime() + (delayDays ?? 0) * MS_PER_DAY);
}
