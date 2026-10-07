import type { z } from 'zod';
import { badRequest } from './errors.js';

/** Validates untrusted input against a zod schema, throwing a 400 that lists every issue. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = result.error.issues
    .map((issue) =>
      issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    )
    .join('; ');
  throw badRequest(issues);
}
