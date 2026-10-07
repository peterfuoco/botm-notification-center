import { describe, expect, it } from 'vitest';
import { eventVisibleAt } from '../../../src/domain/eventVisibleAt.js';

const occurredAt = new Date('2026-10-07T15:30:00Z');

describe('eventVisibleAt', () => {
  it('is immediate when there is no delay', () => {
    expect(eventVisibleAt({ eventType: 'ENROLLED', occurredAt }, null)).toEqual(occurredAt);
    expect(eventVisibleAt({ eventType: 'ENROLLED', occurredAt }, 0)).toEqual(occurredAt);
  });

  it('adds whole days after the event', () => {
    expect(eventVisibleAt({ eventType: 'ENROLLED', occurredAt }, 5).toISOString()).toBe(
      '2026-10-12T15:30:00.000Z',
    );
  });

  it('crosses month and year boundaries', () => {
    const lateDec = new Date('2026-12-29T10:00:00Z');
    expect(eventVisibleAt({ eventType: 'SHIPPED', occurredAt: lateDec }, 5).toISOString()).toBe(
      '2027-01-03T10:00:00.000Z',
    );
  });

  it('uses the publication date for audiobook pre-orders, ignoring delay', () => {
    const publicationDate = new Date('2026-11-03T00:00:00Z');
    const event = { eventType: 'AUDIOBOOK_PREORDER' as const, occurredAt, publicationDate };
    expect(eventVisibleAt(event, 5)).toEqual(publicationDate);
    expect(eventVisibleAt(event, null)).toEqual(publicationDate);
  });

  it('uses occurredAt when the publication date has already passed', () => {
    const publicationDate = new Date('2026-09-01T00:00:00Z');
    expect(
      eventVisibleAt({ eventType: 'AUDIOBOOK_PREORDER', occurredAt, publicationDate }, null),
    ).toEqual(occurredAt);
  });
});
