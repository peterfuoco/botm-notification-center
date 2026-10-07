import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { insertDeliveries } from '../../src/data/accountNotificationsRepo.js';
import type { Db } from '../../src/data/database.js';
import {
  findNotificationById,
  listActiveEventNotifications,
  setNotificationActive,
} from '../../src/data/notificationsRepo.js';
import { AppError } from '../../src/lib/errors.js';
import { activateNotification } from '../../src/services/activateNotification.js';
import { createNotification } from '../../src/services/createNotification.js';
import { deactivateNotification } from '../../src/services/deactivateNotification.js';
import { getFeed } from '../../src/services/getFeed.js';
import { markNotificationClicked } from '../../src/services/markNotificationClicked.js';
import { removeNotification } from '../../src/services/removeNotification.js';
import { runCleanup } from '../../src/services/runCleanup.js';
import { runFilterSweep } from '../../src/services/runFilterSweep.js';
import type { ServiceDeps } from '../../src/services/serviceDeps.js';
import { triggerEvent } from '../../src/services/triggerEvent.js';
import { updateNotification } from '../../src/services/updateNotification.js';
import { uploadCsvRecipients } from '../../src/services/uploadCsvRecipients.js';
import { createFakeClock, type FakeClock } from '../helpers/fakeClock.js';
import { createTestDb, type TestDb } from '../helpers/testDb.js';

// End-to-end through the services against a real MySQL test DB, driving time with a fake clock.

const START = '2026-10-07T12:00:00.000Z';
const DAY = 86_400_000;
const content = {
  iconUrl: 'https://cdn.example.com/i.png',
  headline: 'Headline',
  subheadline: 'Subheadline',
  linkPath: '/my-box',
};
const noFilter = {
  policies: [],
  relationshipStatuses: [],
  countries: [],
  minCredits: null,
  maxCredits: null,
};

// Account ids (inserted in order): 1 = 0 credits, 2 = 3 credits, 3 = 1 credit.
const ZERO_CREDITS = 1;
const THREE_CREDITS = 2;
const ONE_CREDIT = 3;

let testDb: TestDb;
let db: Db;
let clock: FakeClock;
let deps: ServiceDeps;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
  const at = new Date(START);
  await db
    .insertInto('accounts')
    .values(
      (
        [
          { country: 'US', policy: 'MONTHLY', relationship_status: 'NEW_MEMBER', credits: 0 },
          { country: 'US', policy: 'ANNUAL', relationship_status: 'BFF', credits: 3 },
          { country: 'CA', policy: 'MONTHLY', relationship_status: 'FRIEND', credits: 1 },
        ] as const
      ).map((a) => ({ ...a, created_at: at, updated_at: at })),
    )
    .execute();
});

afterAll(async () => {
  await testDb.destroy();
});

beforeEach(async () => {
  await testDb.reset();
  clock = createFakeClock(START);
  deps = { db, clock };
});

async function expectAppError(promise: Promise<unknown>, status: number, message?: RegExp) {
  const error: unknown = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  if (!(error instanceof AppError)) return;
  expect(error.status).toBe(status);
  if (message) expect(error.message).toMatch(message);
}

const feed = (accountId: number, limit = 50) => getFeed(deps, accountId, { limit });

const createEvent = (eventType: 'ENROLLED' | 'SHIPPED', delayDays: number | null) =>
  createNotification(deps, { type: 'EVENT', ...content, eventType, delayDays });

const trigger = (eventId: string, accountId: number, eventType: 'ENROLLED' | 'SHIPPED') =>
  triggerEvent(deps, { eventId, accountId, eventType, occurredAt: clock.now() });

describe('event notifications', () => {
  it('only send while active, appear after the delay, and are idempotent per eventId', async () => {
    const event = await createEvent('ENROLLED', 5);
    expect((await trigger('e0', ZERO_CREDITS, 'ENROLLED')).deliveriesCreated).toBe(0); // inactive

    await activateNotification(deps, event.id);
    expect((await trigger('e1', ZERO_CREDITS, 'ENROLLED')).deliveriesCreated).toBe(1);
    expect((await trigger('e1', ZERO_CREDITS, 'ENROLLED')).deliveriesCreated).toBe(0); // replay
    expect((await feed(ZERO_CREDITS)).items).toEqual([]); // still pending

    clock.advanceDays(5);
    const [item] = (await feed(ZERO_CREDITS)).items;
    expect(item).toMatchObject({
      notificationId: event.id,
      sentAt: '2026-10-12T12:00:00.000Z',
      isClicked: false,
    });
  });

  it('send one notification per distinct event (2 referrals -> 2)', async () => {
    const event = await createEvent('SHIPPED', null);
    await activateNotification(deps, event.id);
    await trigger('ship-1', ONE_CREDIT, 'SHIPPED');
    await trigger('ship-2', ONE_CREDIT, 'SHIPPED');
    expect((await feed(ONE_CREDIT)).items).toHaveLength(2);
  });

  it('audiobook pre-orders go live at the publication date, ignoring the delay', async () => {
    const event = await createNotification(deps, {
      type: 'EVENT',
      ...content,
      eventType: 'AUDIOBOOK_PREORDER',
      delayDays: 30,
    });
    await activateNotification(deps, event.id);
    await triggerEvent(deps, {
      eventId: 'ab-1',
      accountId: THREE_CREDITS,
      eventType: 'AUDIOBOOK_PREORDER',
      occurredAt: clock.now(),
      publicationDate: new Date('2026-10-20T00:00:00Z'),
    });

    clock.set('2026-10-19T23:59:59Z');
    expect((await feed(THREE_CREDITS)).items).toEqual([]);
    clock.set('2026-10-20T00:00:00Z');
    expect((await feed(THREE_CREDITS)).items[0]?.sentAt).toBe('2026-10-20T00:00:00.000Z');
  });

  it('deactivate cancels pending deliveries but keeps visible ones', async () => {
    const event = await createEvent('ENROLLED', 5);
    await activateNotification(deps, event.id);
    await trigger('e1', ZERO_CREDITS, 'ENROLLED');
    clock.advanceDays(5);
    await trigger('e2', ZERO_CREDITS, 'ENROLLED'); // pending until day 10

    expect((await deactivateNotification(deps, event.id)).pendingCancelled).toBe(1);
    expect((await trigger('e3', ZERO_CREDITS, 'ENROLLED')).deliveriesCreated).toBe(0);

    clock.advanceDays(6);
    const items = (await feed(ZERO_CREDITS)).items;
    expect(items.map((i) => i.sentAt)).toEqual(['2026-10-12T12:00:00.000Z']);
  });

  it('rejects events for unknown accounts', async () => {
    await expectAppError(trigger('e1', 999, 'ENROLLED'), 404);
  });
});

describe('filter notifications', () => {
  it('send on activate, once per UTC month, and again next month', async () => {
    const filter = await createNotification(deps, {
      type: 'FILTER',
      ...content,
      ...noFilter,
      minCredits: 1,
    });
    expect((await activateNotification(deps, filter.id)).deliveriesCreated).toBe(2);
    expect(await runFilterSweep(deps)).toEqual({ notificationsSwept: 1, deliveriesCreated: 0 });

    clock.set('2026-10-31T23:59:59Z');
    expect(await runFilterSweep(deps)).toEqual({ notificationsSwept: 1, deliveriesCreated: 0 });
    clock.set('2026-11-01T00:00:00Z');
    expect(await runFilterSweep(deps)).toEqual({ notificationsSwept: 1, deliveriesCreated: 2 });
    expect((await feed(ONE_CREDIT)).items).toHaveLength(2);
    expect((await feed(ZERO_CREDITS)).items).toEqual([]);
  });

  it('validate edits against the stored type and merged credit range', async () => {
    const filter = await createNotification(deps, {
      type: 'FILTER',
      ...content,
      ...noFilter,
      minCredits: 1,
    });
    await expectAppError(updateNotification(deps, filter.id, { maxCredits: 0 }), 400, /minCredits/);
    await expectAppError(updateNotification(deps, filter.id, { delayDays: 3 }), 400, /delayDays/);
    const updated = await updateNotification(deps, filter.id, { maxCredits: 1 });
    expect(updated.type === 'FILTER' && updated.filter.maxCredits).toBe(1);
  });
});

describe('CSV notifications', () => {
  it('reject activate/deactivate and non-CSV uploads', async () => {
    const csv = await createNotification(deps, {
      type: 'CSV',
      ...content,
      sendAt: new Date(START),
    });
    const filter = await createNotification(deps, { type: 'FILTER', ...content, ...noFilter });
    await expectAppError(activateNotification(deps, csv.id), 409);
    await expectAppError(deactivateNotification(deps, csv.id), 409);
    await expectAppError(uploadCsvRecipients(deps, filter.id, '1'), 409, /not CSV/);
    await expectAppError(uploadCsvRecipients(deps, 9999, '1'), 404);
    await expectAppError(uploadCsvRecipients(deps, csv.id, 'account_id\nabc'), 400);
  });

  it('show at send_at, report parse results, and ignore re-uploads', async () => {
    const csv = await createNotification(deps, {
      type: 'CSV',
      ...content,
      sendAt: new Date('2026-10-15T14:00:00Z'),
    });
    expect(await uploadCsvRecipients(deps, csv.id, 'account_id\n1\n3\n3\n999\nxyz')).toEqual({
      submitted: 3,
      inserted: 2,
      skipped: 1,
      duplicateCount: 1,
      invalidLines: [{ line: 6, value: 'xyz' }],
    });
    expect((await uploadCsvRecipients(deps, csv.id, '1\n3')).inserted).toBe(0);

    expect((await feed(ONE_CREDIT)).items).toEqual([]);
    clock.set('2026-10-15T14:00:00Z');
    expect((await feed(ONE_CREDIT)).items[0]?.sentAt).toBe('2026-10-15T14:00:00.000Z');
  });

  it('use the upload time when send_at has already passed', async () => {
    const csv = await createNotification(deps, {
      type: 'CSV',
      ...content,
      sendAt: new Date('2026-10-01T00:00:00Z'),
    });
    await uploadCsvRecipients(deps, csv.id, '3');
    expect((await feed(ONE_CREDIT)).items[0]?.sentAt).toBe(START);
  });
});

describe('member feed', () => {
  it('shows content edits on delivered copies and tracks clicks per owner', async () => {
    const event = await createEvent('ENROLLED', null);
    await activateNotification(deps, event.id);
    await trigger('e1', ZERO_CREDITS, 'ENROLLED');
    const [item] = (await feed(ZERO_CREDITS)).items;
    if (!item) throw new Error('expected a feed item');

    await updateNotification(deps, event.id, { headline: 'Edited' });
    expect((await feed(ZERO_CREDITS)).items[0]?.headline).toBe('Edited');

    await expectAppError(markNotificationClicked(deps, THREE_CREDITS, item.id), 404);
    await markNotificationClicked(deps, ZERO_CREDITS, item.id);
    await markNotificationClicked(deps, ZERO_CREDITS, item.id); // repeat is fine
    expect((await feed(ZERO_CREDITS)).items[0]?.isClicked).toBe(true);
  });

  it('pages with a cursor and rejects junk cursors', async () => {
    const event = await createEvent('SHIPPED', null);
    await activateNotification(deps, event.id);
    for (const id of ['a', 'b', 'c']) {
      await trigger(id, ONE_CREDIT, 'SHIPPED');
      clock.advanceMs(1000);
    }
    const all = await feed(ONE_CREDIT);
    const page1 = await getFeed(deps, ONE_CREDIT, { limit: 2 });
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await getFeed(deps, ONE_CREDIT, { limit: 2, cursor: page1.nextCursor ?? '' });
    expect(page2.nextCursor).toBeNull();
    expect([...page1.items, ...page2.items].map((i) => i.id)).toEqual(all.items.map((i) => i.id));
    await expectAppError(getFeed(deps, ONE_CREDIT, { limit: 2, cursor: 'garbage' }), 400);
  });

  it('remove hides a notification from everyone and blocks further changes', async () => {
    const filter = await createNotification(deps, {
      type: 'FILTER',
      ...content,
      ...noFilter,
      minCredits: 1,
    });
    await activateNotification(deps, filter.id);
    const [item] = (await feed(THREE_CREDITS)).items;
    if (!item) throw new Error('expected a feed item');
    await markNotificationClicked(deps, THREE_CREDITS, item.id);

    await removeNotification(deps, filter.id);
    await removeNotification(deps, filter.id); // idempotent
    expect((await feed(THREE_CREDITS)).items).toEqual([]);
    await expectAppError(markNotificationClicked(deps, THREE_CREDITS, item.id), 404);
    await expectAppError(activateNotification(deps, filter.id), 409, /removed/);
    await expectAppError(updateNotification(deps, filter.id, { headline: 'x' }), 409);

    clock.set('2026-11-01T00:00:00Z');
    expect(await runFilterSweep(deps)).toEqual({ notificationsSwept: 0, deliveriesCreated: 0 });
  });

  it('hides notifications after the 2-static-month window and cleanup deletes them', async () => {
    const event = await createEvent('SHIPPED', null);
    await activateNotification(deps, event.id);
    clock.set('2026-08-15T12:00:00Z');
    await trigger('old', ONE_CREDIT, 'SHIPPED');

    clock.set('2026-09-30T23:59:59Z');
    expect((await feed(ONE_CREDIT)).items).toHaveLength(1);
    clock.set('2026-10-01T00:00:00Z');
    expect((await feed(ONE_CREDIT)).items).toEqual([]); // hidden even before cleanup
    expect(await runCleanup(deps)).toEqual({ cutoff: '2026-09-01T00:00:00.000Z', deleted: 1 });
  });
});

describe('deactivate vs. event trigger race', () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('a trigger that arrives while deactivate holds the lock waits, then sends nothing', async () => {
    const event = await createEvent('SHIPPED', 3);
    await activateNotification(deps, event.id);

    // Same steps as deactivateNotification, holding the lock open for a while.
    const deactivating = db.transaction().execute(async (trx) => {
      await findNotificationById(trx, event.id, { lock: 'update' });
      await setNotificationActive(trx, event.id, false, clock.now());
      await sleep(300);
    });
    await sleep(50);
    const result = await trigger('race-1', ONE_CREDIT, 'SHIPPED');
    await deactivating;

    expect(result.deliveriesCreated).toBe(0);
  });

  it('a deactivate that arrives while a trigger holds its lock waits, then cancels the pending delivery', async () => {
    const event = await createEvent('SHIPPED', 3);
    await activateNotification(deps, event.id);

    // Same steps as triggerEvent, holding the shared lock open for a while.
    const triggering = db.transaction().execute(async (trx) => {
      const active = await listActiveEventNotifications(trx, 'SHIPPED', { lock: 'share' });
      await insertDeliveries(
        trx,
        active.map((n) => ({
          notificationId: n.id,
          accountId: ONE_CREDIT,
          visibleAt: new Date(clock.now().getTime() + 3 * DAY),
          dedupeKey: 'race-2',
        })),
        clock.now(),
      );
      await sleep(300);
    });
    await sleep(50);
    const result = await deactivateNotification(deps, event.id);
    await triggering;

    expect(result.pendingCancelled).toBe(1);
    clock.advanceDays(4);
    expect((await feed(ONE_CREDIT)).items).toEqual([]);
  });
});
