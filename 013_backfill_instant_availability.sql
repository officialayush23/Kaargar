-- 013_backfill_instant_availability.sql
--
-- Bug: PATCH /workers/status (the Dashboard's online/offline toggle) only
-- ever set worker_profiles.status. The instant-dispatch matching query in
-- BACKEND/services/matching.py additionally requires
-- worker_profiles.is_instant_available = true, a separate column that
-- nothing in the live code path ever set (it defaults to false at signup
-- and was only reachable via a rarely-visited manual toggle on the worker's
-- Profile settings page). Net effect: a worker could be genuinely "online"
-- per the Dashboard toggle (which promises "You will receive new job
-- requests") and still never be found by instant dispatch, no matter how
-- close they were to a job.
--
-- The application-code fix (workers.py's update_status handler) now keeps
-- is_instant_available in sync with status going forward. This migration
-- backfills any worker who is *currently* online so they don't stay stuck
-- in the broken state until their next toggle.
UPDATE worker_profiles
SET is_instant_available = true
WHERE status = 'online'
  AND is_instant_available = false;
