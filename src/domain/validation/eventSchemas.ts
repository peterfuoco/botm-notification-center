import { z } from 'zod';
import { accountIdSchema, isoDateTimeSchema } from './common.js';

const eventIdSchema = z.string().trim().min(1).max(64);

const baseFields = {
  eventId: eventIdSchema,
  accountId: accountIdSchema,
  occurredAt: isoDateTimeSchema,
};

/** POST /events body. publicationDate is required for (and only allowed on) AUDIOBOOK_PREORDER. */
export const triggerEventSchema = z.discriminatedUnion('eventType', [
  z.strictObject({
    ...baseFields,
    eventType: z.literal('AUDIOBOOK_PREORDER'),
    publicationDate: isoDateTimeSchema,
  }),
  z.strictObject({
    ...baseFields,
    eventType: z.enum(['SHIPPED', 'ENROLLED']),
  }),
]);
export type TriggerEventInput = z.infer<typeof triggerEventSchema>;
