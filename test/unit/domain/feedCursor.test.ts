import { describe, expect, it } from 'vitest';
import { decodeFeedCursor, encodeFeedCursor } from '../../../src/domain/feedCursor.js';

describe('feed cursor', () => {
  it('round-trips visibleAt (with ms) and id', () => {
    const cursor = { visibleAt: new Date('2026-10-07T15:30:00.123Z'), id: 42 };
    const encoded = encodeFeedCursor(cursor);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFeedCursor(encoded)).toEqual(cursor);
  });

  it.each([
    ['empty', ''],
    ['not base64 of a cursor', 'hello'],
    ['missing id', Buffer.from('1791387000123:').toString('base64url')],
    ['zero id', Buffer.from('1791387000123:0').toString('base64url')],
    ['negative time', Buffer.from('-5:1').toString('base64url')],
    ['extra parts', Buffer.from('1:2:3').toString('base64url')],
    ['unsafe id', Buffer.from('1:9007199254740993').toString('base64url')],
  ])('rejects %s', (_label, value) => {
    expect(decodeFeedCursor(value)).toBeNull();
  });
});
