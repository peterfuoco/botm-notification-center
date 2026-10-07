// Single source of truth for enum values. Validation schemas and DB types derive from these;
// keep them in sync with the ENUM columns in db/schema.sql.

export const COUNTRIES = ['US', 'CA'] as const;
export type Country = (typeof COUNTRIES)[number];

export const POLICIES = ['MONTHLY', 'ANNUAL'] as const;
export type Policy = (typeof POLICIES)[number];

export const RELATIONSHIP_STATUSES = ['NEW_MEMBER', 'FRIEND', 'BFF'] as const;
export type RelationshipStatus = (typeof RELATIONSHIP_STATUSES)[number];

export const NOTIFICATION_TYPES = ['EVENT', 'FILTER', 'CSV'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const EVENT_TYPES = ['SHIPPED', 'ENROLLED', 'AUDIOBOOK_PREORDER'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Account {
  id: number;
  country: Country;
  policy: Policy;
  relationshipStatus: RelationshipStatus;
  credits: number;
}

/** Eligibility rules for a FILTER notification. Empty arrays and null bounds mean "no restriction". */
export interface AccountFilter {
  policies: readonly Policy[];
  relationshipStatuses: readonly RelationshipStatus[];
  countries: readonly Country[];
  minCredits: number | null;
  maxCredits: number | null;
}
