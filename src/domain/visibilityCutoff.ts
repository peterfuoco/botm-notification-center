/**
 * Earliest visible_at still shown in the feed: the start of the previous UTC calendar month.
 * Notifications are visible for the current + previous static month, e.g. one sent Aug 15
 * is visible through Sep 30 and gone on Oct 1.
 */
export function visibilityCutoff(now: Date): Date {
  // Date.UTC normalizes month -1 to December of the prior year.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}
