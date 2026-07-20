-- 010_job_completion_flow.sql
-- Worker job-input (before/after photos, extra items+receipts), customer approval,
-- completion OTP, and payment-amount lockdown.
-- Storage buckets job_before_after / job_item_photos already exist in Supabase — this
-- migration only adds the DB-side columns/table that reference paths in those buckets.

BEGIN;

-- ── jobs: photo phases + approval + completion OTP ─────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS before_photos              TEXT[],
  ADD COLUMN IF NOT EXISTS after_photos                TEXT[],
  ADD COLUMN IF NOT EXISTS extra_items_total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_total              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS approved_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_for_approval_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_otp_code         VARCHAR(6),
  ADD COLUMN IF NOT EXISTS completion_otp_expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_otp_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_otp_locked_until TIMESTAMPTZ;

-- Fast lookup for "jobs waiting on me" queries (worker waiting-room / customer inbox)
CREATE INDEX IF NOT EXISTS idx_jobs_awaiting_approval
  ON jobs (user_id, submitted_for_approval_at)
  WHERE status = 'awaiting_approval';

CREATE INDEX IF NOT EXISTS idx_jobs_approved_pending_otp
  ON jobs (worker_id, approved_at)
  WHERE status = 'approved';

-- ── job_item_receipts: connects a job to each extra item + its receipt ─────
CREATE TABLE IF NOT EXISTS job_item_receipts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_by         UUID REFERENCES worker_profiles(id),
  name               VARCHAR(200) NOT NULL,
  amount             NUMERIC(10,2) NOT NULL CHECK (amount > 0 AND amount <= 50000),
  item_photo_path    TEXT NOT NULL,   -- path within job_item_photos bucket
  receipt_photo_path TEXT NOT NULL,   -- path within job_item_photos bucket
  is_approved        BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every read path is "give me all items for this job" or "pending items for this job" —
-- both covered by one composite index.
CREATE INDEX IF NOT EXISTS idx_job_item_receipts_job
  ON job_item_receipts (job_id, is_approved);

COMMIT;
