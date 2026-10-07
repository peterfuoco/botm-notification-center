import { z } from 'zod';

/** Positive integer that survives the round trip through a JS number. */
export const accountIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

/** ISO 8601 timestamp that must carry a zone (Z or offset); parsed to a Date. */
export const isoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

/** A page on our site: absolute path, not protocol-relative, no scheme. */
export const linkPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^\/(?!\/)/, 'must be a site path starting with a single "/"')
  .refine((value) => !/[\s\\]/.test(value), 'must not contain whitespace or backslashes');

export const iconUrlSchema = z
  .url({ protocol: /^https$/, error: 'must be an https URL' })
  .max(1024);

export const headlineSchema = z.string().trim().min(1).max(120);
export const subheadlineSchema = z.string().trim().min(1).max(255);

/** Multi-select of enum values; empty means "all". Duplicates are rejected. */
export function uniqueEnumArray<const T extends readonly [string, ...string[]]>(values: T) {
  return z
    .array(z.enum(values))
    .refine((items) => new Set(items).size === items.length, 'must not contain duplicates');
}
