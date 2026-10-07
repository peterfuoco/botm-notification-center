-- Notification center schema (MySQL 8.0 / Aurora MySQL 3).
--
-- Loaded by Docker init into the dev DB and by the integration test into a
-- throwaway test DB, so this file must not name a database.
--
-- Time: every DATETIME is UTC. No column has a CURRENT_TIMESTAMP default;
-- the app writes all timestamps from its injected clock.

CREATE TABLE accounts (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  country             ENUM('US', 'CA') NOT NULL,
  policy              ENUM('MONTHLY', 'ANNUAL') NOT NULL,
  relationship_status ENUM('NEW_MEMBER', 'FRIEND', 'BFF') NOT NULL,
  credits             INT UNSIGNED NOT NULL,
  created_at          DATETIME(3) NOT NULL,
  updated_at          DATETIME(3) NOT NULL,
  PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- One row per admin-defined notification. Type-specific columns are nullable
-- and the CHECK constraints keep them consistent with `type`.
CREATE TABLE notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type        ENUM('EVENT', 'FILTER', 'CSV') NOT NULL,
  icon_url    VARCHAR(1024) NOT NULL,
  headline    VARCHAR(120) NOT NULL,
  subheadline VARCHAR(255) NOT NULL,
  link_path   VARCHAR(512) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  removed_at  DATETIME(3) NULL,
  created_at  DATETIME(3) NOT NULL,
  updated_at  DATETIME(3) NOT NULL,

  -- EVENT
  event_type ENUM('SHIPPED', 'ENROLLED', 'AUDIOBOOK_PREORDER') NULL,
  delay_days SMALLINT UNSIGNED NULL,

  -- FILTER (JSON arrays of enum values; empty array = all eligible)
  filter_policies              JSON NULL,
  filter_relationship_statuses JSON NULL,
  filter_countries             JSON NULL,
  min_credits                  INT UNSIGNED NULL,
  max_credits                  INT UNSIGNED NULL,

  -- CSV
  send_at DATETIME(3) NULL,

  PRIMARY KEY (id),
  INDEX idx_notifications_type_active (type, is_active),
  INDEX idx_notifications_event_active (event_type, is_active),

  CONSTRAINT chk_event_fields CHECK (
    (type = 'EVENT' AND event_type IS NOT NULL)
    OR (type <> 'EVENT' AND event_type IS NULL AND delay_days IS NULL)
  ),
  CONSTRAINT chk_filter_fields CHECK (
    -- IS NOT NULL guards matter: JSON_TYPE(NULL) is NULL, and a CHECK that
    -- evaluates to NULL passes.
    (type = 'FILTER'
      AND filter_policies IS NOT NULL AND JSON_TYPE(filter_policies) = 'ARRAY'
      AND filter_relationship_statuses IS NOT NULL AND JSON_TYPE(filter_relationship_statuses) = 'ARRAY'
      AND filter_countries IS NOT NULL AND JSON_TYPE(filter_countries) = 'ARRAY')
    OR (type <> 'FILTER'
      AND filter_policies IS NULL
      AND filter_relationship_statuses IS NULL
      AND filter_countries IS NULL
      AND min_credits IS NULL
      AND max_credits IS NULL)
  ),
  CONSTRAINT chk_credit_range CHECK (
    min_credits IS NULL OR max_credits IS NULL OR min_credits <= max_credits
  ),
  CONSTRAINT chk_csv_fields CHECK (
    (type = 'CSV' AND send_at IS NOT NULL AND is_active = FALSE)
    OR (type <> 'CSV' AND send_at IS NULL)
  )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- One row per notification delivered to an account.
-- visible_at: when it goes live (drives "sent X ago", delays, pub dates, CSV send date).
-- dedupe_key: EVENT = caller's event id, FILTER = 'YYYY-MM' (UTC), CSV = 'once'.
CREATE TABLE account_notifications (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id BIGINT UNSIGNED NOT NULL,
  account_id      BIGINT UNSIGNED NOT NULL,
  visible_at      DATETIME(3) NOT NULL,
  clicked_at      DATETIME(3) NULL,
  dedupe_key      VARCHAR(64) NOT NULL,
  created_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery (notification_id, account_id, dedupe_key),
  INDEX idx_feed (account_id, visible_at),
  INDEX idx_visible_at (visible_at),
  CONSTRAINT fk_delivery_notification FOREIGN KEY (notification_id)
    REFERENCES notifications (id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_account FOREIGN KEY (account_id)
    REFERENCES accounts (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;
