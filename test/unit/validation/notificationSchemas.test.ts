import { describe, expect, it } from 'vitest';
import {
  createNotificationSchema,
  updateNotificationSchema,
} from '../../../src/domain/validation/notificationSchemas.js';

const content = {
  iconUrl: 'https://cdn.example.com/icon.png',
  headline: 'Hello',
  subheadline: 'World',
  linkPath: '/my-box',
};

describe('createNotificationSchema', () => {
  it('accepts an EVENT and defaults delayDays to null', () => {
    const parsed = createNotificationSchema.parse({
      type: 'EVENT',
      ...content,
      eventType: 'SHIPPED',
    });
    expect(parsed).toMatchObject({ type: 'EVENT', eventType: 'SHIPPED', delayDays: null });
  });

  it('accepts a FILTER and defaults empty filters', () => {
    const parsed = createNotificationSchema.parse({ type: 'FILTER', ...content });
    expect(parsed).toMatchObject({
      policies: [],
      relationshipStatuses: [],
      countries: [],
      minCredits: null,
      maxCredits: null,
    });
  });

  it('accepts a CSV and parses sendAt', () => {
    const parsed = createNotificationSchema.parse({
      type: 'CSV',
      ...content,
      sendAt: '2026-10-15T14:00:00Z',
    });
    expect(parsed.type === 'CSV' && parsed.sendAt.toISOString()).toBe('2026-10-15T14:00:00.000Z');
  });

  it('accepts min = max credits', () => {
    expect(
      createNotificationSchema.safeParse({
        type: 'FILTER',
        ...content,
        minCredits: 3,
        maxCredits: 3,
      }).success,
    ).toBe(true);
  });

  it.each([
    ['unknown type', { type: 'PUSH', ...content }],
    ['missing headline', { type: 'EVENT', ...content, headline: undefined, eventType: 'SHIPPED' }],
    [
      'headline too long',
      { type: 'EVENT', ...content, headline: 'x'.repeat(121), eventType: 'SHIPPED' },
    ],
    ['blank subheadline', { type: 'EVENT', ...content, subheadline: '   ', eventType: 'SHIPPED' }],
    ['unknown event type', { type: 'EVENT', ...content, eventType: 'BIRTHDAY' }],
    ['delay over 365', { type: 'EVENT', ...content, eventType: 'SHIPPED', delayDays: 366 }],
    ['negative delay', { type: 'EVENT', ...content, eventType: 'SHIPPED', delayDays: -1 }],
    ['fractional delay', { type: 'EVENT', ...content, eventType: 'SHIPPED', delayDays: 1.5 }],
    ['isActive on create', { type: 'EVENT', ...content, eventType: 'SHIPPED', isActive: true }],
    ['EVENT with filter field', { type: 'EVENT', ...content, eventType: 'SHIPPED', countries: [] }],
    ['min > max', { type: 'FILTER', ...content, minCredits: 5, maxCredits: 2 }],
    ['negative credits', { type: 'FILTER', ...content, minCredits: -1 }],
    ['unknown country', { type: 'FILTER', ...content, countries: ['MX'] }],
    ['duplicate policy', { type: 'FILTER', ...content, policies: ['MONTHLY', 'MONTHLY'] }],
    ['CSV without sendAt', { type: 'CSV', ...content }],
    ['CSV sendAt without zone', { type: 'CSV', ...content, sendAt: '2026-10-15T14:00:00' }],
  ])('rejects %s', (_label, body) => {
    expect(createNotificationSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateNotificationSchema', () => {
  it('accepts a partial content edit', () => {
    expect(updateNotificationSchema.parse({ headline: 'New' })).toEqual({ headline: 'New' });
  });

  it('allows clearing nullable fields', () => {
    expect(updateNotificationSchema.parse({ delayDays: null, minCredits: null })).toEqual({
      delayDays: null,
      minCredits: null,
    });
  });

  it.each([
    ['empty body', {}],
    ['locked type', { type: 'FILTER' }],
    ['locked eventType', { eventType: 'SHIPPED' }],
    ['locked sendAt', { sendAt: '2026-10-15T14:00:00Z' }],
    ['isActive (use activate/deactivate)', { isActive: true }],
    ['min > max', { minCredits: 5, maxCredits: 2 }],
  ])('rejects %s', (_label, body) => {
    expect(updateNotificationSchema.safeParse(body).success).toBe(false);
  });
});
