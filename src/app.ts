import type Router from '@koa/router';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { Db } from './data/database.js';
import type { Clock } from './lib/clock.js';
import { errorHandler } from './middleware/errorHandler.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { eventRoutes } from './routes/eventRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { memberRoutes } from './routes/memberRoutes.js';

export interface AppDeps {
  db: Db;
  clock: Clock;
  adminApiKey: string;
}

/** Builds the Koa app without listening, so it can be started by server.ts or used in tests. */
export function createApp(deps: AppDeps): Koa {
  const app = new Koa();

  app.use(errorHandler);
  app.use(
    bodyParser({
      enableTypes: ['json', 'text'],
      // CSV recipient uploads arrive as a raw text/csv body.
      extendTypes: { text: ['text/csv'] },
      jsonLimit: '1mb',
      textLimit: '5mb',
    }),
  );

  const routers: Router[] = [healthRoutes(deps), adminRoutes(deps), eventRoutes(deps)];
  for (const router of routers) app.use(router.routes()).use(router.allowedMethods());
  const member = memberRoutes(deps);
  app.use(member.routes()).use(member.allowedMethods());

  return app;
}
