import { findFeed } from '../data/accountNotificationsRepo.js';
import { decodeFeedCursor, encodeFeedCursor } from '../domain/feedCursor.js';
import { visibilityCutoff } from '../domain/visibilityCutoff.js';
import { badRequest } from '../lib/errors.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface FeedItem {
  id: number;
  notificationId: number;
  iconUrl: string;
  headline: string;
  subheadline: string;
  linkPath: string;
  /** ISO timestamp it went live; the client renders "sent 5 minutes ago". */
  sentAt: string;
  /** false = show the blue unread bubble. */
  isClicked: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/**
 * A member's notifications, newest first. Shows deliveries that are live and inside the
 * 2-static-month window, hides removed notifications, and deliberately ignores is_active:
 * deactivating only stops new sends.
 */
export async function getFeed(
  deps: ServiceDeps,
  accountId: number,
  page: { limit: number; cursor?: string },
): Promise<FeedPage> {
  const now = deps.clock.now();
  const cursor = page.cursor === undefined ? undefined : decodeFeedCursor(page.cursor);
  if (cursor === null) throw badRequest('Invalid cursor');

  // Fetch one extra row to know whether another page exists.
  const rows = await findFeed(deps.db, {
    accountId,
    now,
    cutoff: visibilityCutoff(now),
    limit: page.limit + 1,
    ...(cursor && { cursor }),
  });
  const pageRows = rows.slice(0, page.limit);
  const last = pageRows.at(-1);

  return {
    items: pageRows.map((row) => ({
      id: row.id,
      notificationId: row.notificationId,
      iconUrl: row.iconUrl,
      headline: row.headline,
      subheadline: row.subheadline,
      linkPath: row.linkPath,
      sentAt: row.visibleAt.toISOString(),
      isClicked: row.clickedAt !== null,
    })),
    nextCursor:
      rows.length > page.limit && last
        ? encodeFeedCursor({ visibleAt: last.visibleAt, id: last.id })
        : null,
  };
}
