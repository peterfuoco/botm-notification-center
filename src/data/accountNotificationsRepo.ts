import type { AccountFilter } from '../domain/types.js';
import { accountFilterCondition } from './accountFilterCondition.js';
import type { Db } from './database.js';

// Every time comparison here takes `now` / `cutoff` from the caller — never SQL NOW().

export interface NewDelivery {
  notificationId: number;
  accountId: number;
  visibleAt: Date;
  dedupeKey: string;
}

/** INSERT IGNORE: rows that hit the (notification, account, dedupe_key) unique key are skipped. */
export async function insertDeliveries(
  db: Db,
  deliveries: readonly NewDelivery[],
  now: Date,
): Promise<number> {
  if (deliveries.length === 0) return 0;
  const result = await db
    .insertInto('account_notifications')
    .orIgnore()
    .values(
      deliveries.map((d) => ({
        notification_id: d.notificationId,
        account_id: d.accountId,
        visible_at: d.visibleAt,
        dedupe_key: d.dedupeKey,
        created_at: now,
      })),
    )
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0n);
}

interface BulkDelivery {
  notificationId: number;
  visibleAt: Date;
  dedupeKey: string;
  now: Date;
}

/** Set-based fan-out: one INSERT IGNORE ... SELECT over accounts matching the filter. */
export async function insertDeliveriesForFilter(
  db: Db,
  delivery: BulkDelivery & { filter: AccountFilter },
): Promise<number> {
  const result = await db
    .insertInto('account_notifications')
    .orIgnore()
    .columns(['notification_id', 'account_id', 'visible_at', 'dedupe_key', 'created_at'])
    .expression((eb) =>
      eb
        .selectFrom('accounts')
        .select((s) => [
          s.val(delivery.notificationId).as('notification_id'),
          'accounts.id as account_id',
          s.val(delivery.visibleAt).as('visible_at'),
          s.val(delivery.dedupeKey).as('dedupe_key'),
          s.val(delivery.now).as('created_at'),
        ])
        .where((w) => accountFilterCondition(w, delivery.filter)),
    )
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0n);
}

/** CSV fan-out: inserts only ids that exist in accounts; unknown ids are skipped. */
export async function insertDeliveriesForAccountIds(
  db: Db,
  delivery: BulkDelivery & { accountIds: readonly number[] },
): Promise<number> {
  if (delivery.accountIds.length === 0) return 0;
  const result = await db
    .insertInto('account_notifications')
    .orIgnore()
    .columns(['notification_id', 'account_id', 'visible_at', 'dedupe_key', 'created_at'])
    .expression((eb) =>
      eb
        .selectFrom('accounts')
        .select((s) => [
          s.val(delivery.notificationId).as('notification_id'),
          'accounts.id as account_id',
          s.val(delivery.visibleAt).as('visible_at'),
          s.val(delivery.dedupeKey).as('dedupe_key'),
          s.val(delivery.now).as('created_at'),
        ])
        .where('accounts.id', 'in', delivery.accountIds),
    )
    .executeTakeFirst();
  return Number(result.numInsertedOrUpdatedRows ?? 0n);
}

export interface FeedCursor {
  visibleAt: Date;
  id: number;
}

export interface FeedRow {
  id: number;
  notificationId: number;
  iconUrl: string;
  headline: string;
  subheadline: string;
  linkPath: string;
  visibleAt: Date;
  clickedAt: Date | null;
}

/**
 * A member's visible notifications, newest first: live (visible_at <= now), inside the
 * 2-month window (visible_at >= cutoff), and not removed. Keyset-paginated on (visible_at, id).
 */
export async function findFeed(
  db: Db,
  query: { accountId: number; now: Date; cutoff: Date; limit: number; cursor?: FeedCursor },
): Promise<FeedRow[]> {
  const { cursor } = query;
  let builder = db
    .selectFrom('account_notifications as an')
    .innerJoin('notifications as n', 'n.id', 'an.notification_id')
    .select([
      'an.id',
      'an.notification_id',
      'n.icon_url',
      'n.headline',
      'n.subheadline',
      'n.link_path',
      'an.visible_at',
      'an.clicked_at',
    ])
    .where('an.account_id', '=', query.accountId)
    .where('an.visible_at', '<=', query.now)
    .where('an.visible_at', '>=', query.cutoff)
    .where('n.removed_at', 'is', null);

  if (cursor) {
    builder = builder.where((eb) =>
      eb.or([
        eb('an.visible_at', '<', cursor.visibleAt),
        eb.and([eb('an.visible_at', '=', cursor.visibleAt), eb('an.id', '<', cursor.id)]),
      ]),
    );
  }

  const rows = await builder
    .orderBy('an.visible_at', 'desc')
    .orderBy('an.id', 'desc')
    .limit(query.limit)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    notificationId: row.notification_id,
    iconUrl: row.icon_url,
    headline: row.headline,
    subheadline: row.subheadline,
    linkPath: row.link_path,
    visibleAt: row.visible_at,
    clickedAt: row.clicked_at,
  }));
}

export interface DeliveryRecord {
  id: number;
  notificationId: number;
  accountId: number;
  visibleAt: Date;
  clickedAt: Date | null;
}

export async function findDeliveryById(db: Db, id: number): Promise<DeliveryRecord | undefined> {
  const row = await db
    .selectFrom('account_notifications')
    .select(['id', 'notification_id', 'account_id', 'visible_at', 'clicked_at'])
    .where('id', '=', id)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      notificationId: row.notification_id,
      accountId: row.account_id,
      visibleAt: row.visible_at,
      clickedAt: row.clicked_at,
    }
  );
}

/**
 * Marks a live delivery clicked for its owner. The first click time is kept (COALESCE), so
 * repeat clicks are no-ops. Returns true if the delivery exists, belongs to the account and is
 * live — including repeat clicks, since mysql2 reports matched (not changed) rows by default.
 */
export async function markDeliveryClicked(
  db: Db,
  click: { id: number; accountId: number; now: Date },
): Promise<boolean> {
  const result = await db
    .updateTable('account_notifications')
    .set((eb) => ({ clicked_at: eb.fn.coalesce('clicked_at', eb.val(click.now)) }))
    .where('id', '=', click.id)
    .where('account_id', '=', click.accountId)
    .where('visible_at', '<=', click.now)
    .executeTakeFirst();
  return result.numUpdatedRows > 0n;
}

/** Cancels deliveries that haven't gone live yet (used on deactivate). */
export async function deletePendingDeliveries(
  db: Db,
  notificationId: number,
  now: Date,
): Promise<number> {
  const result = await db
    .deleteFrom('account_notifications')
    .where('notification_id', '=', notificationId)
    .where('visible_at', '>', now)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}

/** Retention: deletes everything that went live before the visibility cutoff. */
export async function deleteExpiredDeliveries(db: Db, cutoff: Date): Promise<number> {
  const result = await db
    .deleteFrom('account_notifications')
    .where('visible_at', '<', cutoff)
    .executeTakeFirst();
  return Number(result.numDeletedRows);
}
