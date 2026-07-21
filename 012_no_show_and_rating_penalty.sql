-- 012_no_show_and_rating_penalty.sql
-- Adds worker no-show tracking to jobs, and a standing rating-penalty offset
-- to worker_profiles so a no-show penalty survives future avg_rating
-- recomputations (which are otherwise derived fresh from the reviews table).

BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS no_show_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_show_status VARCHAR(20);

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS rating_penalty_total NUMERIC(3,2) NOT NULL DEFAULT 0;

COMMIT;
