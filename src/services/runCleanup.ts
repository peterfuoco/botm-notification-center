import { deleteExpiredDeliveries } from '../data/accountNotificationsRepo.js';
import { visibilityCutoff } from '../domain/visibilityCutoff.js';
import type { ServiceDeps } from './serviceDeps.js';

export interface CleanupResult {
  cutoff: string;
  deleted: number;
}

/**
 * Wipes deliveries older than the 2-static-month window. The feed already hides them, so this
 * only reclaims storage. Would run daily on a cron in production; here it's called from tests
 * and the admin maintenance endpoint.
 */
export async function runCleanup(deps: ServiceDeps): Promise<CleanupResult> {
  const cutoff = visibilityCutoff(deps.clock.now());
  const deleted = await deleteExpiredDeliveries(deps.db, cutoff);
  return { cutoff: cutoff.toISOString(), deleted };
}
