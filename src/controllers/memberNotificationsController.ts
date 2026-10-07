import type { RouterMiddleware } from '@koa/router';
import { feedQuerySchema, idParamSchema } from '../domain/validation/requestSchemas.js';
import { parseInput } from '../lib/parseInput.js';
import type { MemberState } from '../middleware/requireMember.js';
import { getFeed } from '../services/getFeed.js';
import { markNotificationClicked } from '../services/markNotificationClicked.js';
import type { ServiceDeps } from '../services/serviceDeps.js';

/** The member's notification page. Always scoped to the authenticated account. */
export function memberNotificationsController(deps: ServiceDeps) {
  const feed: RouterMiddleware<MemberState> = async (ctx) => {
    const query = parseInput(feedQuerySchema, ctx.query);
    ctx.body = await getFeed(deps, ctx.state.accountId, query);
  };

  const click: RouterMiddleware<MemberState> = async (ctx) => {
    const { id } = parseInput(idParamSchema, ctx.params);
    await markNotificationClicked(deps, ctx.state.accountId, id);
    ctx.status = 204;
  };

  return { feed, click };
}
