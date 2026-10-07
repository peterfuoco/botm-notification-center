import type { ColumnType, Generated, Kysely } from 'kysely';
import type {
  Country,
  EventType,
  NotificationType,
  Policy,
  RelationshipStatus,
} from '../domain/types.js';

// Hand-written to match db/schema.sql — keep the two in sync.
// DATETIME columns are UTC and come back as Dates (pool timezone 'Z').
// BOOLEAN (TINYINT(1)) comes back as boolean via the pool's typeCast.
// JSON columns come back parsed; they are written as JSON strings.

type JsonArray<T> = ColumnType<T[] | null, string | null, string | null>;

export interface AccountsTable {
  id: Generated<number>;
  country: Country;
  policy: Policy;
  relationship_status: RelationshipStatus;
  credits: number;
  created_at: Date;
  updated_at: Date;
}

export interface NotificationsTable {
  id: Generated<number>;
  type: NotificationType;
  icon_url: string;
  headline: string;
  subheadline: string;
  link_path: string;
  is_active: ColumnType<boolean, boolean | undefined, boolean>;
  removed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  event_type: EventType | null;
  delay_days: number | null;
  filter_policies: JsonArray<Policy>;
  filter_relationship_statuses: JsonArray<RelationshipStatus>;
  filter_countries: JsonArray<Country>;
  min_credits: number | null;
  max_credits: number | null;
  send_at: Date | null;
}

export interface AccountNotificationsTable {
  id: Generated<number>;
  notification_id: number;
  account_id: number;
  visible_at: Date;
  clicked_at: Date | null;
  dedupe_key: string;
  created_at: Date;
}

export interface Database {
  accounts: AccountsTable;
  notifications: NotificationsTable;
  account_notifications: AccountNotificationsTable;
}

/** A Kysely instance or transaction; repos accept either. */
export type Db = Kysely<Database>;
