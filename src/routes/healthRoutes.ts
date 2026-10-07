import Router from '@koa/router';
import type { Clock } from '../lib/clock.js';

export function healthRoutes(clock: Clock): Router {
  const router = new Router();
  router.get('/health', (ctx) => {
    ctx.body = { status: 'ok', time: clock.now().toISOString() };
  });
  return router;
}
