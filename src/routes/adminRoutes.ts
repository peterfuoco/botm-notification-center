import Router from '@koa/router';
import { adminNotificationsController } from '../controllers/adminNotificationsController.js';
import { maintenanceController } from '../controllers/maintenanceController.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import type { ServiceDeps } from '../services/serviceDeps.js';

export function adminRoutes(deps: ServiceDeps & { adminApiKey: string }): Router {
  const notifications = adminNotificationsController(deps);
  const maintenance = maintenanceController(deps);

  const router = new Router({ prefix: '/admin' });
  router.use(requireAdmin(deps.adminApiKey));

  router.post('/notifications', notifications.create);
  router.get('/notifications', notifications.list);
  router.get('/notifications/:id', notifications.get);
  router.patch('/notifications/:id', notifications.update);
  router.post('/notifications/:id/activate', notifications.activate);
  router.post('/notifications/:id/deactivate', notifications.deactivate);
  router.post('/notifications/:id/remove', notifications.remove);
  router.post('/notifications/:id/recipients', notifications.uploadRecipients);

  router.post('/maintenance/run', maintenance.run);
  return router;
}
