-- 011_multi_day_booking.sql
-- Worker opt-in toggle allowing a Discovery-mode customer to book them
-- across multiple days for the same service in a single booking flow.

BEGIN;

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS allow_multi_day_booking BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
