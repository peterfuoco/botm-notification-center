import { z } from 'zod';
import { COUNTRIES, EVENT_TYPES, POLICIES, RELATIONSHIP_STATUSES } from '../types.js';
import {
  headlineSchema,
  iconUrlSchema,
  isoDateTimeSchema,
  linkPathSchema,
  subheadlineSchema,
  uniqueEnumArray,
} from './common.js';

export const MAX_DELAY_DAYS = 365;

const delayDaysSchema = z.number().int().min(0).max(MAX_DELAY_DAYS).nullable();
const creditBoundSchema = z.number().int().min(0).nullable();

const contentFields = {
  iconUrl: iconUrlSchema,
  headline: headlineSchema,
  subheadline: subheadlineSchema,
  linkPath: linkPathSchema,
};

const creditRangeIsValid = (v: { minCredits?: number | null; maxCredits?: number | null }) =>
  v.minCredits === undefined ||
  v.minCredits === null ||
  v.maxCredits === undefined ||
  v.maxCredits === null ||
  v.minCredits <= v.maxCredits;

const creditRangeError = {
  message: 'minCredits must be less than or equal to maxCredits',
  path: ['minCredits'],
};

// New notifications always start inactive; activation is its own endpoint.
export const createNotificationSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('EVENT'),
    ...contentFields,
    eventType: z.enum(EVENT_TYPES),
    delayDays: delayDaysSchema.default(null),
  }),
  z
    .strictObject({
      type: z.literal('FILTER'),
      ...contentFields,
      policies: uniqueEnumArray(POLICIES).default([]),
      relationshipStatuses: uniqueEnumArray(RELATIONSHIP_STATUSES).default([]),
      countries: uniqueEnumArray(COUNTRIES).default([]),
      minCredits: creditBoundSchema.default(null),
      maxCredits: creditBoundSchema.default(null),
    })
    .refine(creditRangeIsValid, creditRangeError),
  z.strictObject({
    type: z.literal('CSV'),
    ...contentFields,
    sendAt: isoDateTimeSchema,
  }),
]);
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

/**
 * Editable fields. type, eventType and sendAt are locked after create (strictObject rejects
 * them). Whether a field applies to the stored notification's type, and the credit range
 * against stored values, is checked in the update service.
 */
export const updateNotificationSchema = z
  .strictObject({
    iconUrl: iconUrlSchema,
    headline: headlineSchema,
    subheadline: subheadlineSchema,
    linkPath: linkPathSchema,
    delayDays: delayDaysSchema,
    policies: uniqueEnumArray(POLICIES),
    relationshipStatuses: uniqueEnumArray(RELATIONSHIP_STATUSES),
    countries: uniqueEnumArray(COUNTRIES),
    minCredits: creditBoundSchema,
    maxCredits: creditBoundSchema,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required')
  .refine(creditRangeIsValid, creditRangeError);
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
