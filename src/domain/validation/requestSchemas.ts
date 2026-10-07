import { z } from 'zod';

/** Route :id params arrive as strings. */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const DEFAULT_FEED_LIMIT = 20;
export const MAX_FEED_LIMIT = 50;

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_FEED_LIMIT).default(DEFAULT_FEED_LIMIT),
  cursor: z.string().min(1).optional(),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** Stub member auth: the X-Account-Id header (a real app would derive this from a session). */
export const accountIdHeaderSchema = z
  .string()
  .regex(/^\d+$/, 'must be a positive integer')
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
