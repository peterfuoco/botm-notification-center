import type { Account, AccountFilter } from './types.js';

/**
 * Reference implementation of FILTER eligibility. The sweep runs the same rules in SQL;
 * the integration test checks the two agree.
 */
export function matchesFilter(account: Account, filter: AccountFilter): boolean {
  if (filter.policies.length > 0 && !filter.policies.includes(account.policy)) return false;
  if (
    filter.relationshipStatuses.length > 0 &&
    !filter.relationshipStatuses.includes(account.relationshipStatus)
  ) {
    return false;
  }
  if (filter.countries.length > 0 && !filter.countries.includes(account.country)) return false;
  if (filter.minCredits !== null && account.credits < filter.minCredits) return false;
  if (filter.maxCredits !== null && account.credits > filter.maxCredits) return false;
  return true;
}
