import type { Account } from '../domain/types.js';
import type { Db } from './database.js';

export async function findAccountById(db: Db, id: number): Promise<Account | undefined> {
  const row = await db
    .selectFrom('accounts')
    .select(['id', 'country', 'policy', 'relationship_status', 'credits'])
    .where('id', '=', id)
    .executeTakeFirst();
  return (
    row && {
      id: row.id,
      country: row.country,
      policy: row.policy,
      relationshipStatus: row.relationship_status,
      credits: row.credits,
    }
  );
}

/** All accounts, for checking SQL filter results against matchesFilter in tests. */
export async function listAccounts(db: Db): Promise<Account[]> {
  const rows = await db
    .selectFrom('accounts')
    .select(['id', 'country', 'policy', 'relationship_status', 'credits'])
    .orderBy('id')
    .execute();
  return rows.map((row) => ({
    id: row.id,
    country: row.country,
    policy: row.policy,
    relationshipStatus: row.relationship_status,
    credits: row.credits,
  }));
}
