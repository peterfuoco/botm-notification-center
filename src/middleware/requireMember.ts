import type { Middleware } from 'koa';
import { accountIdHeaderSchema } from '../domain/validation/requestSchemas.js';
import { unauthorized } from '../lib/errors.js';

export interface MemberState {
  accountId: number;
}

/** Stub member auth: trusts the X-Account-Id header. Replace with real session auth. */
export const requireMember: Middleware<MemberState> = async (ctx, next) => {
  const parsed = accountIdHeaderSchema.safeParse(ctx.get('X-Account-Id'));
  if (!parsed.success) throw unauthorized('Missing or invalid X-Account-Id');
  ctx.state.accountId = parsed.data;
  await next();
};
