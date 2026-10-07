import type { Expression, ExpressionBuilder, SqlBool } from 'kysely';
import type { AccountFilter } from '../domain/types.js';
import type { Database } from './database.js';

/**
 * SQL version of domain/matchesFilter: empty multi-selects and null credit bounds add no
 * condition, so an empty filter matches every account.
 */
export function accountFilterCondition(
  eb: ExpressionBuilder<Database, 'accounts'>,
  filter: AccountFilter,
): Expression<SqlBool> {
  const conditions: Expression<SqlBool>[] = [];
  if (filter.policies.length > 0) {
    conditions.push(eb('accounts.policy', 'in', filter.policies));
  }
  if (filter.relationshipStatuses.length > 0) {
    conditions.push(eb('accounts.relationship_status', 'in', filter.relationshipStatuses));
  }
  if (filter.countries.length > 0) {
    conditions.push(eb('accounts.country', 'in', filter.countries));
  }
  if (filter.minCredits !== null) {
    conditions.push(eb('accounts.credits', '>=', filter.minCredits));
  }
  if (filter.maxCredits !== null) {
    conditions.push(eb('accounts.credits', '<=', filter.maxCredits));
  }
  return eb.and(conditions);
}
