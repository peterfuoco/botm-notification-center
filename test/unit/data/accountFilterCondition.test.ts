import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely';
import { describe, expect, it } from 'vitest';
import { accountFilterCondition } from '../../../src/data/accountFilterCondition.js';
import type { Database } from '../../../src/data/database.js';
import type { AccountFilter } from '../../../src/domain/types.js';

// Compiles SQL without a database connection.
const db = new Kysely<Database>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (k) => new MysqlIntrospector(k),
    createQueryCompiler: () => new MysqlQueryCompiler(),
  },
});

const noFilter: AccountFilter = {
  policies: [],
  relationshipStatuses: [],
  countries: [],
  minCredits: null,
  maxCredits: null,
};

function compileWhere(filter: AccountFilter) {
  const { sql, parameters } = db
    .selectFrom('accounts')
    .select('id')
    .where((eb) => accountFilterCondition(eb, filter))
    .compile();
  return { where: sql.replace(/^.* where /, ''), parameters };
}

describe('accountFilterCondition', () => {
  it('adds no restriction for an empty filter', () => {
    expect(compileWhere(noFilter)).toEqual({ where: '1 = 1', parameters: [] });
  });

  it('ANDs every set filter with IN lists and inclusive credit bounds', () => {
    expect(
      compileWhere({
        policies: ['MONTHLY', 'ANNUAL'],
        relationshipStatuses: ['BFF'],
        countries: ['US'],
        minCredits: 1,
        maxCredits: 3,
      }),
    ).toEqual({
      where:
        '(`accounts`.`policy` in (?, ?) and `accounts`.`relationship_status` in (?) and ' +
        '`accounts`.`country` in (?) and `accounts`.`credits` >= ? and `accounts`.`credits` <= ?)',
      parameters: ['MONTHLY', 'ANNUAL', 'BFF', 'US', 1, 3],
    });
  });

  it('keeps a zero bound (0 is not "unset")', () => {
    expect(compileWhere({ ...noFilter, maxCredits: 0 })).toEqual({
      where: '`accounts`.`credits` <= ?',
      parameters: [0],
    });
  });
});
