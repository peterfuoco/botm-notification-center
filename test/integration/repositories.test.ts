import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as deliveries from '../../src/data/accountNotificationsRepo.js';
import { listAccounts } from '../../src/data/accountsRepo.js';
import type { Db } from '../../src/data/database.js';
import * as notifications from '../../src/data/notificationsRepo.js';
import { matchesFilter } from '../../src/domain/matchesFilter.js';
import {
  COUNTRIES,
  POLICIES,
  RELATIONSHIP_STATUSES,
  type AccountFilter,
  type Notification,
} from '../../src/domain/types.js';
import type { CreateNotificationInput } from '../../src/domain/validation/notificationSchemas.js';
import { createTestDb, type TestDb } from '../helpers/testDb.js';

const DAY = 86_400_000;
const now = new Date('2026-10-07T15:30:00.123Z');
const cutoff = new Date('2026-09-01T00:00:00.000Z'); // visibilityCutoff(now)
const content = {
  iconUrl: 'https://cdn.example.com/i.png',
  headline: 'Headline',
  subheadline: 'Subheadline',
  linkPath: '/my-box',
};
const noFilter: AccountFilter = {
  policies: [],
  relationshipStatuses: [],
  countries: [],
  minCredits: null,
  maxCredits: null,
};

let testDb: TestDb;
let db: Db;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  // Every country x policy x status x credit combination (48 accounts).
  const rows = COUNTRIES.flatMap((country) =>
    POLICIES.flatMap((policy) =>
      RELATIONSHIP_STATUSES.flatMap((relationship_status) =>
        [0, 1, 3, 5].map((credits) => ({
          country,
          policy,
          relationship_status,
          credits,
          created_at: now,
          updated_at: now,
        })),
      ),
    ),
  );
  await db.insertInto('accounts').values(rows).execute();
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.reset();
});

const create = (input: CreateNotificationInput): Promise<Notification> =>
  notifications.insertNotification(db, input, now);

const createFilter = (partial: Partial<AccountFilter> = {}) => {
  const filter = { ...noFilter, ...partial };
  return create({
    type: 'FILTER',
    ...content,
    policies: [...filter.policies],
    relationshipStatuses: [...filter.relationshipStatuses],
    countries: [...filter.countries],
    minCredits: filter.minCredits,
    maxCredits: filter.maxCredits,
  });
};

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value');
  return value;
}

const deliveryKeys = async (notificationId: number) =>
  (
    await db
      .selectFrom('account_notifications')
      .select('dedupe_key')
      .where('notification_id', '=', notificationId)
      .orderBy('dedupe_key')
      .execute()
  ).map((r) => r.dedupe_key);

describe('notificationsRepo', () => {
  it('round-trips each type with booleans, JSON arrays and UTC millisecond timestamps', async () => {
    const event = await create({ type: 'EVENT', ...content, eventType: 'SHIPPED', delayDays: 5 });
    expect(event).toMatchObject({ type: 'EVENT', eventType: 'SHIPPED', delayDays: 5 });
    expect(event.isActive).toBe(false);
    expect(event.removedAt).toBeNull();
    expect(event.createdAt.toISOString()).toBe(now.toISOString());

    const filter = await createFilter({ countries: ['US'], minCredits: 1 });
    expect(filter.type === 'FILTER' && filter.filter).toEqual({
      ...noFilter,
      countries: ['US'],
      minCredits: 1,
    });

    const csv = await create({ type: 'CSV', ...content, sendAt: new Date('2026-10-15T14:00:00Z') });
    expect(csv.type === 'CSV' && csv.sendAt.toISOString()).toBe('2026-10-15T14:00:00.000Z');

    const raw = await sql<{ stored_value: string; tz: string }>`
      SELECT CAST(created_at AS CHAR) AS stored_value, @@session.time_zone AS tz
      FROM notifications WHERE id = ${event.id}`.execute(db);
    expect(raw.rows[0]).toEqual({ stored_value: '2026-10-07 15:30:00.123', tz: '+00:00' });
  });

  it('updates fields, toggles active, and lists active notifications by type', async () => {
    const event = await create({ type: 'EVENT', ...content, eventType: 'SHIPPED', delayDays: 5 });
    const filter = await createFilter();

    await notifications.updateNotification(db, event.id, { headline: 'New', delayDays: null }, now);
    expect(await notifications.findNotificationById(db, event.id)).toMatchObject({
      headline: 'New',
      delayDays: null,
    });

    expect(await notifications.listActiveEventNotifications(db, 'SHIPPED')).toEqual([]);
    await notifications.setNotificationActive(db, event.id, true, now);
    await notifications.setNotificationActive(db, filter.id, true, now);
    expect(
      (await notifications.listActiveEventNotifications(db, 'SHIPPED')).map((n) => n.id),
    ).toEqual([event.id]);
    expect(await notifications.listActiveEventNotifications(db, 'ENROLLED')).toEqual([]);
    expect((await notifications.listActiveFilterNotifications(db)).map((n) => n.id)).toEqual([
      filter.id,
    ]);

    const listed = await notifications.listNotifications(db, { limit: 1, offset: 0 });
    expect(listed.map((n) => n.id)).toEqual([filter.id]);
  });

  it('remove is permanent: deactivates, keeps the first removed_at, drops out of active lists', async () => {
    const filter = await createFilter();
    await notifications.setNotificationActive(db, filter.id, true, now);

    await notifications.markNotificationRemoved(db, filter.id, now);
    await notifications.markNotificationRemoved(db, filter.id, new Date(now.getTime() + DAY));

    const removed = await notifications.findNotificationById(db, filter.id);
    expect(removed?.isActive).toBe(false);
    expect(removed?.removedAt?.toISOString()).toBe(now.toISOString());
    expect(await notifications.listActiveFilterNotifications(db)).toEqual([]);
  });
});

describe('accountNotificationsRepo', () => {
  it.each<[string, Partial<AccountFilter>]>([
    ['empty filter (everyone)', {}],
    [
      'multi-select policies + status',
      { policies: ['ANNUAL'], relationshipStatuses: ['FRIEND', 'BFF'] },
    ],
    ['country + min credits', { countries: ['CA'], minCredits: 1 }],
    ['exact credits (min = max)', { minCredits: 3, maxCredits: 3 }],
    ['no credits (max 0)', { maxCredits: 0 }],
  ])(
    'filter fan-out selects exactly the accounts matchesFilter accepts: %s',
    async (_label, partial) => {
      const filter = { ...noFilter, ...partial };
      const notification = await createFilter(filter);
      const expected = (await listAccounts(db))
        .filter((a) => matchesFilter(a, filter))
        .map((a) => a.id);

      const params = {
        notificationId: notification.id,
        filter,
        visibleAt: now,
        dedupeKey: '2026-10',
        now,
      };
      expect(await deliveries.insertDeliveriesForFilter(db, params)).toBe(expected.length);
      expect(await deliveries.insertDeliveriesForFilter(db, params)).toBe(0); // same month: deduped

      const got = await db
        .selectFrom('account_notifications')
        .select('account_id')
        .where('notification_id', '=', notification.id)
        .orderBy('account_id')
        .execute();
      expect(got.map((r) => r.account_id)).toEqual(expected);
      expect(expected.length).toBeGreaterThan(0);
    },
  );

  it('CSV fan-out inserts known ids once and skips unknown ids', async () => {
    const csv = await create({ type: 'CSV', ...content, sendAt: now });
    const params = {
      notificationId: csv.id,
      accountIds: [1, 2, 999_999],
      visibleAt: now,
      dedupeKey: 'once',
      now,
    };
    expect(await deliveries.insertDeliveriesForAccountIds(db, params)).toBe(2);
    expect(await deliveries.insertDeliveriesForAccountIds(db, params)).toBe(0);
  });

  it('event deliveries are idempotent per dedupe key', async () => {
    const event = await create({
      type: 'EVENT',
      ...content,
      eventType: 'ENROLLED',
      delayDays: null,
    });
    const delivery = { notificationId: event.id, accountId: 1, visibleAt: now, dedupeKey: 'evt-1' };
    expect(await deliveries.insertDeliveries(db, [delivery], now)).toBe(1);
    expect(await deliveries.insertDeliveries(db, [delivery], now)).toBe(0);
    expect(await deliveries.insertDeliveries(db, [{ ...delivery, dedupeKey: 'evt-2' }], now)).toBe(
      1,
    );
  });

  it('feed shows live, in-window, non-removed deliveries newest first, with stable cursor paging', async () => {
    const event = await create({
      type: 'EVENT',
      ...content,
      eventType: 'ENROLLED',
      delayDays: null,
    });
    const removed = await create({
      type: 'EVENT',
      ...content,
      eventType: 'SHIPPED',
      delayDays: null,
    });
    const at = (iso: string) => new Date(iso);
    await deliveries.insertDeliveries(
      db,
      [
        { notificationId: event.id, accountId: 1, visibleAt: now, dedupeKey: 'live-now' },
        {
          notificationId: event.id,
          accountId: 1,
          visibleAt: at('2026-10-01T00:00:00Z'),
          dedupeKey: 'live-a',
        },
        {
          notificationId: event.id,
          accountId: 1,
          visibleAt: at('2026-10-01T00:00:00Z'),
          dedupeKey: 'live-b',
        }, // same time: id breaks the tie
        { notificationId: event.id, accountId: 1, visibleAt: cutoff, dedupeKey: 'at-cutoff' },
        {
          notificationId: event.id,
          accountId: 1,
          visibleAt: at('2026-08-31T23:59:59.999Z'),
          dedupeKey: 'expired',
        },
        {
          notificationId: event.id,
          accountId: 1,
          visibleAt: new Date(now.getTime() + 1),
          dedupeKey: 'pending',
        },
        { notificationId: event.id, accountId: 2, visibleAt: now, dedupeKey: 'other-account' },
        { notificationId: removed.id, accountId: 1, visibleAt: now, dedupeKey: 'removed' },
      ],
      now,
    );
    await notifications.markNotificationRemoved(db, removed.id, now);

    const feed = await deliveries.findFeed(db, { accountId: 1, now, cutoff, limit: 50 });
    expect(feed.map((f) => f.visibleAt.toISOString())).toEqual([
      now.toISOString(),
      '2026-10-01T00:00:00.000Z',
      '2026-10-01T00:00:00.000Z',
      '2026-09-01T00:00:00.000Z',
    ]);
    expect(must(feed[1]).id).toBeGreaterThan(must(feed[2]).id);
    expect(feed[0]).toMatchObject({
      notificationId: event.id,
      headline: 'Headline',
      clickedAt: null,
    });

    // Page size 2 splits the tied pair across pages; together pages equal the full feed.
    const page1 = await deliveries.findFeed(db, { accountId: 1, now, cutoff, limit: 2 });
    const last = must(page1.at(-1));
    const page2 = await deliveries.findFeed(db, {
      accountId: 1,
      now,
      cutoff,
      limit: 50,
      cursor: { visibleAt: last.visibleAt, id: last.id },
    });
    expect([...page1, ...page2].map((f) => f.id)).toEqual(feed.map((f) => f.id));
  });

  it('markDeliveryClicked: owner only, live only, first click time kept, repeat clicks succeed', async () => {
    const event = await create({
      type: 'EVENT',
      ...content,
      eventType: 'ENROLLED',
      delayDays: null,
    });
    await deliveries.insertDeliveries(
      db,
      [
        { notificationId: event.id, accountId: 1, visibleAt: now, dedupeKey: 'live' },
        {
          notificationId: event.id,
          accountId: 1,
          visibleAt: new Date(now.getTime() + DAY),
          dedupeKey: 'pending',
        },
      ],
      now,
    );
    const [delivery] = await deliveries.findFeed(db, { accountId: 1, now, cutoff, limit: 1 });
    const id = must(delivery).id;
    const later = new Date(now.getTime() + DAY);
    const click = (accountId: number, deliveryId: number, at: Date) =>
      deliveries.markDeliveryClicked(db, { id: deliveryId, accountId, now: at });

    // Another member guessing the id changes nothing.
    expect(await click(2, id, now)).toBe(false);
    expect((await deliveries.findDeliveryById(db, id))?.clickedAt).toBeNull();

    // Owner's first click sets clicked_at; a repeat click succeeds and keeps the first time.
    expect(await click(1, id, now)).toBe(true);
    expect(await click(1, id, later)).toBe(true);
    expect((await deliveries.findDeliveryById(db, id))?.clickedAt?.toISOString()).toBe(
      now.toISOString(),
    );

    // A delivery that isn't live yet can't be clicked.
    const pending = await db
      .selectFrom('account_notifications')
      .select('id')
      .where('dedupe_key', '=', 'pending')
      .executeTakeFirstOrThrow();
    expect(await click(1, pending.id, now)).toBe(false);
    expect((await deliveries.findDeliveryById(db, pending.id))?.clickedAt).toBeNull();

    // Unknown id.
    expect(await click(1, id + 1000, now)).toBe(false);
  });

  it('deletes only pending deliveries for one notification, and only rows strictly before the cutoff', async () => {
    const a = await create({ type: 'EVENT', ...content, eventType: 'ENROLLED', delayDays: null });
    const b = await create({ type: 'EVENT', ...content, eventType: 'SHIPPED', delayDays: null });
    await deliveries.insertDeliveries(
      db,
      [
        { notificationId: a.id, accountId: 1, visibleAt: now, dedupeKey: 'a-live' },
        {
          notificationId: a.id,
          accountId: 1,
          visibleAt: new Date(now.getTime() + DAY),
          dedupeKey: 'a-pending',
        },
        { notificationId: a.id, accountId: 1, visibleAt: cutoff, dedupeKey: 'a-at-cutoff' },
        {
          notificationId: a.id,
          accountId: 1,
          visibleAt: new Date(cutoff.getTime() - 1),
          dedupeKey: 'a-expired',
        },
        {
          notificationId: b.id,
          accountId: 1,
          visibleAt: new Date(now.getTime() + DAY),
          dedupeKey: 'b-pending',
        },
      ],
      now,
    );

    expect(await deliveries.deletePendingDeliveries(db, a.id, now)).toBe(1);
    expect(await deliveryKeys(b.id)).toEqual(['b-pending']);

    expect(await deliveries.deleteExpiredDeliveries(db, cutoff)).toBe(1);
    expect(await deliveryKeys(a.id)).toEqual(['a-at-cutoff', 'a-live']);
  });
});
