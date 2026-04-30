-- ============================================================
-- KAARGAR — Schema Patch 004: Index & Permission Fixes
-- Run after 003_fixes.sql
-- ============================================================

-- ─── FIX 1: Volatile NOW() in idx_wp_matching ────────────────
--
-- PostgreSQL prohibits volatile functions (e.g. NOW(), CURRENT_TIMESTAMP)
-- inside partial index WHERE predicates. The original index in
-- 001_initial_schema.sql line 136–141 used:
--
--   AND (auto_offline_until IS NULL OR auto_offline_until < NOW())
--
-- This causes ERROR: functions in index predicate must be marked IMMUTABLE
-- at CREATE INDEX time.
--
-- Fix: drop the broken index and recreate it without the volatile clause.
-- The auto_offline_until check MUST be added to matching queries at runtime:
--
--   WHERE (auto_offline_until IS NULL OR auto_offline_until < NOW())
--
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_wp_matching;

CREATE INDEX idx_wp_matching ON public.worker_profiles(
  avg_rating DESC,
  total_jobs_completed DESC,
  acceptance_rate DESC
)
WHERE status = 'online'
  AND verification_status = 'approved'
  AND is_instant_available = true;

-- ─── FIX 2: Permissions for refresh_tokens (003_fixes.sql) ───
--
-- 003_fixes.sql created public.refresh_tokens but did not grant
-- access to the service_role that the FastAPI backend uses.
-- ─────────────────────────────────────────────────────────────

GRANT ALL ON public.refresh_tokens TO service_role;
GRANT ALL ON public.refresh_tokens TO postgres;

-- Grant sequence usage (if any auto-increment sequences exist in schema)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres;

-- ─── FIX 3: Ensure new columns from 003 are accessible ───────
--
-- Re-grant table permissions for tables altered in 003_fixes.sql
-- so the Supabase Data API (anon/authenticated roles) can read them.
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE ON public.jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO authenticated;

-- ─── NOTE TO DEVELOPER ───────────────────────────────────────
-- After applying this patch, update services/matching.py dispatch
-- query to include the runtime auto_offline check:
--
--   .where(
--     or_(
--       WorkerProfile.auto_offline_until.is_(None),
--       WorkerProfile.auto_offline_until < datetime.now(timezone.utc)
--     )
--   )
--
-- The index (idx_wp_matching) will still be used for the online/
-- approved/instant_available filter; Postgres will apply the
-- auto_offline check as a post-index filter on the small result set.
-- ─────────────────────────────────────────────────────────────
