import Router from '@koa/router';
import { eventsController } from '../controllers/eventsController.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import type { ServiceDeps } from '../services/serviceDeps.js';

/** Internal: called by other services, so it uses the same stub service key as admin. */
export function eventRoutes(deps: ServiceDeps & { adminApiKey: string }): Router {
  const events = eventsController(deps);
  const router = new Router();
  router.post('/events', requireAdmin(deps.adminApiKey), events.trigger);
  return router;
}
