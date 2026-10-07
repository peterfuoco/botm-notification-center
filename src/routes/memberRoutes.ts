import Router from '@koa/router';
import { memberNotificationsController } from '../controllers/memberNotificationsController.js';
import { requireMember, type MemberState } from '../middleware/requireMember.js';
import type { ServiceDeps } from '../services/serviceDeps.js';

export function memberRoutes(deps: ServiceDeps): Router<MemberState> {
  const notifications = memberNotificationsController(deps);
  const router = new Router<MemberState>({ prefix: '/me' });
  router.use(requireMember);
  router.get('/notifications', notifications.feed);
  router.post('/notifications/:id/click', notifications.click);
  return router;
}
