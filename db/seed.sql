-- Dev seed data. Loaded by Docker init after schema.sql (alphabetical).
-- No deliveries are seeded: run the maintenance endpoint or send events to create them.

INSERT INTO accounts (id, country, policy, relationship_status, credits, created_at, updated_at) VALUES
  (1,  'US', 'MONTHLY', 'NEW_MEMBER', 0, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (2,  'US', 'MONTHLY', 'FRIEND',     1, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (3,  'US', 'MONTHLY', 'BFF',        3, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (4,  'US', 'ANNUAL',  'NEW_MEMBER', 1, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (5,  'US', 'ANNUAL',  'FRIEND',     3, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (6,  'US', 'ANNUAL',  'BFF',        5, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (7,  'CA', 'MONTHLY', 'NEW_MEMBER', 0, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (8,  'CA', 'MONTHLY', 'FRIEND',     3, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (9,  'CA', 'MONTHLY', 'BFF',        1, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (10, 'CA', 'ANNUAL',  'NEW_MEMBER', 5, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (11, 'CA', 'ANNUAL',  'FRIEND',     0, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000'),
  (12, 'CA', 'ANNUAL',  'BFF',        3, '2026-01-01 00:00:00.000', '2026-01-01 00:00:00.000');

INSERT INTO notifications
  (id, type, icon_url, headline, subheadline, link_path, is_active, created_at, updated_at,
   event_type, delay_days)
VALUES
  (1, 'EVENT', 'https://cdn.example.com/icons/welcome.png',
   'Welcome to Book of the Month!', 'Pick your first book now.', '/my-box',
   TRUE, '2026-10-01 00:00:00.000', '2026-10-01 00:00:00.000', 'ENROLLED', NULL),
  (2, 'EVENT', 'https://cdn.example.com/icons/audiobook.png',
   'Your audiobook is here', 'Start listening today.', '/audiobooks/library',
   TRUE, '2026-10-01 00:00:00.000', '2026-10-01 00:00:00.000', 'AUDIOBOOK_PREORDER', NULL);

INSERT INTO notifications
  (id, type, icon_url, headline, subheadline, link_path, is_active, created_at, updated_at,
   filter_policies, filter_relationship_statuses, filter_countries, min_credits, max_credits)
VALUES
  (3, 'FILTER', 'https://cdn.example.com/icons/credit.png',
   'You have credits to spend', 'Use a credit on this month''s picks.', '/this-month',
   TRUE, '2026-10-01 00:00:00.000', '2026-10-01 00:00:00.000',
   JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY('US'), 1, NULL);

INSERT INTO notifications
  (id, type, icon_url, headline, subheadline, link_path, is_active, created_at, updated_at,
   send_at)
VALUES
  (4, 'CSV', 'https://cdn.example.com/icons/survey.png',
   'Tell us what you think', 'Take our 2-minute member survey.', '/survey',
   FALSE, '2026-10-01 00:00:00.000', '2026-10-01 00:00:00.000', '2026-10-15 14:00:00.000');
