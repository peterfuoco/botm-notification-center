import type { Middleware } from 'koa';
import { AppError } from '../lib/errors.js';

export interface ErrorBody {
  error: { code: string; message: string };
}

/** Maps thrown errors to a consistent JSON shape. Unknown errors become a 500. */
export const errorHandler: Middleware = async (ctx, next) => {
  try {
    await next();
    if (ctx.status === 404 && ctx.body === undefined) {
      const body: ErrorBody = { error: { code: 'NOT_FOUND', message: 'Route not found' } };
      ctx.status = 404;
      ctx.body = body;
    }
  } catch (err) {
    if (err instanceof AppError) {
      const body: ErrorBody = { error: { code: err.code, message: err.message } };
      ctx.status = err.status;
      ctx.body = body;
      return;
    }
    ctx.app.emit('error', err, ctx);
    const body: ErrorBody = { error: { code: 'INTERNAL', message: 'Internal server error' } };
    ctx.status = 500;
    ctx.body = body;
  }
};
