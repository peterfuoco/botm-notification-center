import type { RouterMiddleware } from '@koa/router';
import { triggerEventSchema } from '../domain/validation/eventSchemas.js';
import { parseInput } from '../lib/parseInput.js';
import type { ServiceDeps } from '../services/serviceDeps.js';
import { triggerEvent } from '../services/triggerEvent.js';

/** Internal endpoint other services call when a member does something (ship, enroll, pre-order). */
export function eventsController(deps: ServiceDeps) {
  const trigger: RouterMiddleware = async (ctx) => {
    const event = parseInput(triggerEventSchema, ctx.request.body);
    ctx.body = await triggerEvent(deps, event);
  };
  return { trigger };
}
