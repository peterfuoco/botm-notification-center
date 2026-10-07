import { insertNotification } from '../data/notificationsRepo.js';
import type { Notification } from '../domain/types.js';
import type { CreateNotificationInput } from '../domain/validation/notificationSchemas.js';
import type { ServiceDeps } from './serviceDeps.js';

/** Creates a notification. It always starts inactive; activation is a separate step. */
export async function createNotification(
  deps: ServiceDeps,
  input: CreateNotificationInput,
): Promise<Notification> {
  return insertNotification(deps.db, input, deps.clock.now());
}
