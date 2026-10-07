import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { Db } from './data/database.js';
import type { Clock } from './lib/clock.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthRoutes } from './routes/healthRoutes.js';

export interface AppDeps {
  db: Db;
  clock: Clock;
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

  const health = healthRoutes(deps);
  app.use(health.routes()).use(health.allowedMethods());

  return app;
}
