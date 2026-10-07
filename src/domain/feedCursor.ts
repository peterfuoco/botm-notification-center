import type { FeedCursor } from './types.js';

/** Opaque cursor for the member feed: base64url of "<visibleAtMs>:<deliveryId>". */
export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(`${cursor.visibleAt.getTime()}:${cursor.id}`).toString('base64url');
}

/** Returns null for anything that isn't a cursor this API produced. */
export function decodeFeedCursor(value: string): FeedCursor | null {
  const match = /^(\d{1,15}):(\d{1,16})$/.exec(Buffer.from(value, 'base64url').toString('utf8'));
  if (!match?.[1] || !match[2]) return null;
  const ms = Number(match[1]);
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { visibleAt: new Date(ms), id };
}
