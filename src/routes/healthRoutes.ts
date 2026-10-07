import Router from '@koa/router';
import { sql } from 'kysely';
import type { Db } from '../data/database.js';
import type { Clock } from '../lib/clock.js';

export function healthRoutes(deps: { db: Db; clock: Clock }): Router {
  const router = new Router();
  router.get('/health', async (ctx) => {
    const time = deps.clock.now().toISOString();
    try {
      await sql`SELECT 1`.execute(deps.db);
      ctx.body = { status: 'ok', db: 'ok', time };
    } catch {
      ctx.status = 503;
      ctx.body = { status: 'degraded', db: 'unreachable', time };
    }
  });
  return router;
}
