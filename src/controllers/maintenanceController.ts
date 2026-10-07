import type { RouterMiddleware } from '@koa/router';
import { runCleanup } from '../services/runCleanup.js';
import { runFilterSweep } from '../services/runFilterSweep.js';
import type { ServiceDeps } from '../services/serviceDeps.js';

/** Stand-in for scheduled jobs: in production these would run on a cron (e.g. EventBridge). */
export function maintenanceController(deps: ServiceDeps) {
  const run: RouterMiddleware = async (ctx) => {
    const filterSweep = await runFilterSweep(deps);
    const cleanup = await runCleanup(deps);
    ctx.body = { filterSweep, cleanup };
  };
  return { run };
}
