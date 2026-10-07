import { Kysely, MysqlDialect } from 'kysely';
import { createPool, type TypeCastField, type TypeCastNext } from 'mysql2';
import type { Config } from '../config/config.js';
import type { Database } from './database.js';

/** BOOLEAN is TINYINT(1) in MySQL; return it as a JS boolean. Everything else uses mysql2 defaults. */
function typeCast(field: TypeCastField, next: TypeCastNext): unknown {
  if (field.type === 'TINY' && field.length === 1) {
    const value = field.string();
    return value === null ? null : value === '1';
  }
  return next();
}

export function createDb(config: Config['db']): Kysely<Database> {
  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: 10,
    // Read and write DATETIMEs as UTC regardless of the server/process time zone.
    timezone: 'Z',
    typeCast,
  });
  return new Kysely<Database>({ dialect: new MysqlDialect({ pool }) });
}
