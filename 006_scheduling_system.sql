-- ============================================================
-- Migration 006: Scheduling System
-- Tables: worker_availability, worker_time_off, worker_schedule_blocks
-- Alterations: jobs table — scheduling + source fields
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Extend jobs table ─────────────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS source            VARCHAR(20) DEFAULT 'instant',
  ADD COLUMN IF NOT EXISTS is_flexible       BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preferred_days    JSONB,          -- ["2025-06-10","2025-06-11","2025-06-12"]
  ADD COLUMN IF NOT EXISTS window_start      TIME,           -- e.g. 16:00
  ADD COLUMN IF NOT EXISTS window_end        TIME,           -- e.g. 18:00
  ADD COLUMN IF NOT EXISTS assigned_date     DATE;           -- which preferred day was ultimately used

-- Back-fill existing rows
UPDATE jobs SET source = job_type WHERE source IS NULL;

-- Index for scheduler queries: find pending scheduled jobs
CREATE INDEX IF NOT EXISTS idx_jobs_source_status
  ON jobs (source, status);

CREATE INDEX IF NOT EXISTS idx_jobs_preferred_days
  ON jobs USING GIN (preferred_days)
  WHERE source = 'scheduled';

-- ── 2. worker_availability — recurring weekly schedule ───────

CREATE TABLE IF NOT EXISTS worker_availability (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id   UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon … 6=Sun
  start_time  TIME        NOT NULL,
  end_time    TIME        NOT NULL,
  is_open     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT wa_time_order CHECK (end_time > start_time),
  CONSTRAINT wa_unique_day  UNIQUE (worker_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_worker_avail_worker
  ON worker_availability (worker_id);

-- ── 3. worker_time_off — temporary unavailability blocks ─────

CREATE TABLE IF NOT EXISTS worker_time_off (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id      UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime   TIMESTAMPTZ NOT NULL,
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT wto_time_order CHECK (end_datetime > start_datetime)
);

CREATE INDEX IF NOT EXISTS idx_worker_time_off_worker
  ON worker_time_off (worker_id);

CREATE INDEX IF NOT EXISTS idx_worker_time_off_range
  ON worker_time_off (worker_id, start_datetime, end_datetime);

-- ── 4. worker_schedule_blocks — reserved time windows ────────

CREATE TABLE IF NOT EXISTS worker_schedule_blocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id    UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  job_id       UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  date         DATE        NOT NULL,
  window_start TIME        NOT NULL,
  window_end   TIME        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT wsb_time_order CHECK (window_end > window_start)
);

CREATE INDEX IF NOT EXISTS idx_wsb_worker_date
  ON worker_schedule_blocks (worker_id, date);

-- Prevent double-booking same worker in overlapping windows on same day:
-- We enforce this in application logic (easier to handle edge cases).
-- A partial index helps find conflicts quickly.
CREATE INDEX IF NOT EXISTS idx_wsb_conflict_check
  ON worker_schedule_blocks (worker_id, date, window_start, window_end);

-- ── 5. Seed default availability for existing workers ────────
-- All 7 days, 9 AM – 9 PM, is_open = TRUE
-- Workers can override via the API.

INSERT INTO worker_availability (worker_id, day_of_week, start_time, end_time, is_open)
SELECT
  wp.id,
  d.day,
  '09:00'::TIME,
  '21:00'::TIME,
  TRUE
FROM worker_profiles wp
CROSS JOIN generate_series(0, 6) AS d(day)
ON CONFLICT (worker_id, day_of_week) DO NOTHING;
