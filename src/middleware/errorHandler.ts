import type { Middleware } from 'koa';
import { AppError } from '../lib/errors.js';

export interface ErrorBody {
  error: { code: string; message: string };
}

const CLIENT_ERROR_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/** Client errors raised by Koa/middleware via http-errors (e.g. malformed JSON, body too large). */
function isExposedClientError(err: unknown): err is { status: number; message: string } {
  if (typeof err !== 'object' || err === null) return false;
  const { status, expose, message } = err as Record<string, unknown>;
  return (
    typeof status === 'number' &&
    status >= 400 &&
    status < 500 &&
    expose === true &&
    typeof message === 'string'
  );
}

/** Maps thrown errors to a consistent JSON shape. Unknown errors become a 500. */
export const errorHandler: Middleware = async (ctx, next) => {
  const respond = (status: number, code: string, message: string): void => {
    const body: ErrorBody = { error: { code, message } };
    ctx.status = status;
    ctx.body = body;
  };

  try {
    await next();
    if (ctx.status === 404 && ctx.body === undefined) {
      respond(404, 'NOT_FOUND', 'Route not found');
    } else if (ctx.status === 405) {
      // From router.allowedMethods(); keeps its Allow header.
      respond(405, 'METHOD_NOT_ALLOWED', `Allowed methods: ${ctx.response.get('Allow')}`);
    }
  } catch (err) {
    if (err instanceof AppError) {
      respond(err.status, err.code, err.message);
      return;
    }
    // co-body marks malformed JSON as status 400 but not `expose`, so handle it explicitly.
    if (err instanceof SyntaxError && (err as { status?: unknown }).status === 400) {
      respond(400, 'BAD_REQUEST', 'Malformed JSON body');
      return;
    }
    if (isExposedClientError(err)) {
      respond(err.status, CLIENT_ERROR_CODES[err.status] ?? 'CLIENT_ERROR', err.message);
      return;
    }
    ctx.app.emit('error', err, ctx);
    respond(500, 'INTERNAL', 'Internal server error');
  }
};
