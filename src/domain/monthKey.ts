/** UTC calendar month as 'YYYY-MM'. Used as the FILTER dedupe key (once per static month). */
export function monthKey(now: Date): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${now.getUTCFullYear()}-${month}`;
}
