import { createHash, timingSafeEqual } from 'node:crypto';
import type { Middleware } from 'koa';
import { unauthorized } from '../lib/errors.js';

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/**
 * Stub admin/internal-service auth: the X-Admin-Key header must match ADMIN_API_KEY.
 * Hashing both sides gives equal-length buffers for a constant-time compare.
 */
export function requireAdmin(adminApiKey: string): Middleware {
  const expected = digest(adminApiKey);
  return async (ctx, next) => {
    const provided = ctx.get('X-Admin-Key');
    if (!provided || !timingSafeEqual(digest(provided), expected)) {
      throw unauthorized('Missing or invalid X-Admin-Key');
    }
    await next();
  };
}
