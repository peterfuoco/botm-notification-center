import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'mysql2/promise';
import { loadConfig } from '../../src/config/config.js';
import { createDb } from '../../src/data/createDb.js';
import type { Db } from '../../src/data/database.js';

const SCHEMA_PATH = new URL('../../db/schema.sql', import.meta.url);

export interface TestDb {
  db: Db;
  /** Clears notifications and deliveries; accounts are left in place. */
  reset(): Promise<void>;
  destroy(): Promise<void>;
}

/**
 * Creates a fresh `<DB_NAME>_test` database from db/schema.sql and returns a Kysely instance
 * for it. Never touches the dev database.
 */
export async function createTestDb(): Promise<TestDb> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = loadConfig();
  const database = `${config.db.database}_test`;

  const admin = await createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.query(`CREATE DATABASE \`${database}\``);
    await admin.query(`USE \`${database}\``);
    await admin.query(readFileSync(SCHEMA_PATH, 'utf8'));
  } finally {
    await admin.end();
  }

  const db = createDb({ ...config.db, database });
  return {
    db,
    reset: async () => {
      await db.deleteFrom('account_notifications').execute();
      await db.deleteFrom('notifications').execute();
    },
    destroy: async () => {
      await db.destroy();
      const cleanup = await createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
      });
      await cleanup.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await cleanup.end();
    },
  };
}
