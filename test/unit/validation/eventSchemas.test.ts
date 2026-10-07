import { describe, expect, it } from 'vitest';
import { eventVisibleAt } from '../../../src/domain/eventVisibleAt.js';
import { triggerEventSchema } from '../../../src/domain/validation/eventSchemas.js';

const base = { eventId: 'evt_123', accountId: 42, occurredAt: '2026-10-07T15:00:00Z' };

describe('triggerEventSchema', () => {
  it('accepts SHIPPED / ENROLLED without a publication date', () => {
    const parsed = triggerEventSchema.parse({ ...base, eventType: 'ENROLLED' });
    expect(parsed.occurredAt.toISOString()).toBe('2026-10-07T15:00:00.000Z');
  });

  it('accepts AUDIOBOOK_PREORDER with a publication date', () => {
    const parsed = triggerEventSchema.parse({
      ...base,
      eventType: 'AUDIOBOOK_PREORDER',
      publicationDate: '2026-11-03T00:00:00Z',
    });
    expect(parsed.eventType === 'AUDIOBOOK_PREORDER' && parsed.publicationDate.toISOString()).toBe(
      '2026-11-03T00:00:00.000Z',
    );
  });

  it('produces input eventVisibleAt accepts directly', () => {
    const parsed = triggerEventSchema.parse({ ...base, eventType: 'SHIPPED' });
    expect(eventVisibleAt(parsed, 1).toISOString()).toBe('2026-10-08T15:00:00.000Z');
  });

  it.each([
    ['AUDIOBOOK_PREORDER without publicationDate', { ...base, eventType: 'AUDIOBOOK_PREORDER' }],
    [
      'publicationDate on a non-audiobook event',
      { ...base, eventType: 'SHIPPED', publicationDate: '2026-11-03T00:00:00Z' },
    ],
    ['missing eventId', { ...base, eventId: undefined, eventType: 'SHIPPED' }],
    ['blank eventId', { ...base, eventId: '   ', eventType: 'SHIPPED' }],
    ['eventId over 64 chars', { ...base, eventId: 'e'.repeat(65), eventType: 'SHIPPED' }],
    ['unknown event type', { ...base, eventType: 'BIRTHDAY' }],
    ['string accountId', { ...base, accountId: '42', eventType: 'SHIPPED' }],
    ['unsafe accountId', { ...base, accountId: Number.MAX_SAFE_INTEGER + 1, eventType: 'SHIPPED' }],
    [
      'occurredAt without zone',
      { ...base, occurredAt: '2026-10-07T15:00:00', eventType: 'SHIPPED' },
    ],
  ])('rejects %s', (_label, body) => {
    expect(triggerEventSchema.safeParse(body).success).toBe(false);
  });
});
