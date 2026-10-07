import type { Selectable, Updateable } from 'kysely';
import type {
  EventNotification,
  EventType,
  FilterNotification,
  Notification,
} from '../domain/types.js';
import type {
  CreateNotificationInput,
  UpdateNotificationInput,
} from '../domain/validation/notificationSchemas.js';
import type { Db, NotificationsTable } from './database.js';

type NotificationRow = Selectable<NotificationsTable>;

/**
 * Row lock for reads inside a transaction: 'update' for admin state changes, 'share' for
 * writers that must not race them (event trigger, filter sweep).
 */
export type RowLock = 'update' | 'share';

export async function insertNotification(
  db: Db,
  input: CreateNotificationInput,
  now: Date,
): Promise<Notification> {
  const base = {
    type: input.type,
    icon_url: input.iconUrl,
    headline: input.headline,
    subheadline: input.subheadline,
    link_path: input.linkPath,
    is_active: false,
    created_at: now,
    updated_at: now,
  };
  const typeColumns =
    input.type === 'EVENT'
      ? { event_type: input.eventType, delay_days: input.delayDays }
      : input.type === 'FILTER'
        ? {
            filter_policies: JSON.stringify(input.policies),
            filter_relationship_statuses: JSON.stringify(input.relationshipStatuses),
            filter_countries: JSON.stringify(input.countries),
            min_credits: input.minCredits,
            max_credits: input.maxCredits,
          }
        : { send_at: input.sendAt };

  const result = await db
    .insertInto('notifications')
    .values({ ...base, ...typeColumns })
    .executeTakeFirstOrThrow();
  const created = await findNotificationById(db, Number(result.insertId));
  if (!created) throw new Error('Inserted notification not found');
  return created;
}

export async function findNotificationById(
  db: Db,
  id: number,
  options: { lock?: RowLock } = {},
): Promise<Notification | undefined> {
  let query = db.selectFrom('notifications').selectAll().where('id', '=', id);
  if (options.lock === 'update') query = query.forUpdate();
  if (options.lock === 'share') query = query.forShare();
  const row = await query.executeTakeFirst();
  return row && toNotification(row);
}

/** Admin listing, newest first. */
export async function listNotifications(
  db: Db,
  page: { limit: number; offset: number },
): Promise<Notification[]> {
  const rows = await db
    .selectFrom('notifications')
    .selectAll()
    .orderBy('id', 'desc')
    .limit(page.limit)
    .offset(page.offset)
    .execute();
  return rows.map(toNotification);
}

/** Applies an already-validated patch. Type applicability is the caller's responsibility. */
export async function updateNotification(
  db: Db,
  id: number,
  patch: UpdateNotificationInput,
  now: Date,
): Promise<void> {
  const values: Updateable<NotificationsTable> = { updated_at: now };
  if (patch.iconUrl !== undefined) values.icon_url = patch.iconUrl;
  if (patch.headline !== undefined) values.headline = patch.headline;
  if (patch.subheadline !== undefined) values.subheadline = patch.subheadline;
  if (patch.linkPath !== undefined) values.link_path = patch.linkPath;
  if (patch.delayDays !== undefined) values.delay_days = patch.delayDays;
  if (patch.policies !== undefined) values.filter_policies = JSON.stringify(patch.policies);
  if (patch.relationshipStatuses !== undefined) {
    values.filter_relationship_statuses = JSON.stringify(patch.relationshipStatuses);
  }
  if (patch.countries !== undefined) values.filter_countries = JSON.stringify(patch.countries);
  if (patch.minCredits !== undefined) values.min_credits = patch.minCredits;
  if (patch.maxCredits !== undefined) values.max_credits = patch.maxCredits;

  await db.updateTable('notifications').set(values).where('id', '=', id).execute();
}

export async function setNotificationActive(
  db: Db,
  id: number,
  isActive: boolean,
  now: Date,
): Promise<void> {
  await db
    .updateTable('notifications')
    .set({ is_active: isActive, updated_at: now })
    .where('id', '=', id)
    .execute();
}

/** Permanent: also deactivates. Keeps the original removed_at if called again. */
export async function markNotificationRemoved(db: Db, id: number, now: Date): Promise<void> {
  await db
    .updateTable('notifications')
    .set((eb) => ({
      is_active: false,
      removed_at: eb.fn.coalesce('removed_at', eb.val(now)),
      updated_at: now,
    }))
    .where('id', '=', id)
    .execute();
}

export async function listActiveEventNotifications(
  db: Db,
  eventType: EventType,
  options: { lock?: RowLock } = {},
): Promise<EventNotification[]> {
  let query = db
    .selectFrom('notifications')
    .selectAll()
    .where('type', '=', 'EVENT')
    .where('event_type', '=', eventType)
    .where('is_active', '=', true)
    .where('removed_at', 'is', null);
  if (options.lock === 'update') query = query.forUpdate();
  if (options.lock === 'share') query = query.forShare();
  const rows = await query.execute();
  return rows.map(toNotification).filter((n): n is EventNotification => n.type === 'EVENT');
}

export async function listActiveFilterNotifications(db: Db): Promise<FilterNotification[]> {
  const rows = await db
    .selectFrom('notifications')
    .selectAll()
    .where('type', '=', 'FILTER')
    .where('is_active', '=', true)
    .where('removed_at', 'is', null)
    .execute();
  return rows.map(toNotification).filter((n): n is FilterNotification => n.type === 'FILTER');
}

function toNotification(row: NotificationRow): Notification {
  const base = {
    id: row.id,
    iconUrl: row.icon_url,
    headline: row.headline,
    subheadline: row.subheadline,
    linkPath: row.link_path,
    isActive: row.is_active,
    removedAt: row.removed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  switch (row.type) {
    case 'EVENT':
      return {
        ...base,
        type: 'EVENT',
        eventType: required(row.event_type, 'event_type', row.id),
        delayDays: row.delay_days,
      };
    case 'FILTER':
      return {
        ...base,
        type: 'FILTER',
        filter: {
          policies: required(row.filter_policies, 'filter_policies', row.id),
          relationshipStatuses: required(
            row.filter_relationship_statuses,
            'filter_relationship_statuses',
            row.id,
          ),
          countries: required(row.filter_countries, 'filter_countries', row.id),
          minCredits: row.min_credits,
          maxCredits: row.max_credits,
        },
      };
    case 'CSV':
      return { ...base, type: 'CSV', sendAt: required(row.send_at, 'send_at', row.id) };
  }
}

// The schema's CHECK constraints guarantee these; this narrows the type and fails loudly if not.
function required<T>(value: T | null, column: string, id: number): T {
  if (value === null) throw new Error(`notifications.${column} is null for notification ${id}`);
  return value;
}
