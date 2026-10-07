import { describe, expect, it } from 'vitest';
import {
  accountIdSchema,
  iconUrlSchema,
  isoDateTimeSchema,
  linkPathSchema,
} from '../../../src/domain/validation/common.js';

describe('linkPathSchema', () => {
  it.each(['/', '/my-box', '/books/123?ref=notif#top'])('accepts %s', (value) => {
    expect(linkPathSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    '',
    'my-box',
    '//evil.com/path',
    'https://evil.com',
    'javascript:alert(1)',
    '/with space',
    '/\\evil.com',
    `/${'a'.repeat(512)}`,
  ])('rejects %s', (value) => {
    expect(linkPathSchema.safeParse(value).success).toBe(false);
  });
});

describe('iconUrlSchema', () => {
  it('accepts https URLs', () => {
    expect(iconUrlSchema.safeParse('https://cdn.example.com/i.png').success).toBe(true);
  });

  it.each(['http://cdn.example.com/i.png', 'javascript:alert(1)', 'not a url', '/relative.png'])(
    'rejects %s',
    (value) => {
      expect(iconUrlSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('isoDateTimeSchema', () => {
  it('parses Z and offset timestamps to Dates', () => {
    expect(isoDateTimeSchema.parse('2026-10-07T15:00:00Z').toISOString()).toBe(
      '2026-10-07T15:00:00.000Z',
    );
    expect(isoDateTimeSchema.parse('2026-10-07T10:00:00-05:00').toISOString()).toBe(
      '2026-10-07T15:00:00.000Z',
    );
  });

  it.each(['2026-10-07T15:00:00', '2026-10-07', 'yesterday'])(
    'rejects %s (no zone or not a timestamp)',
    (value) => {
      expect(isoDateTimeSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('accountIdSchema', () => {
  it('accepts positive safe integers', () => {
    expect(accountIdSchema.safeParse(1).success).toBe(true);
    expect(accountIdSchema.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects %s', (value) => {
    expect(accountIdSchema.safeParse(value).success).toBe(false);
  });
});
