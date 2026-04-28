-- ============================================================
-- KAARGAR — Schema Patch: Bug Fixes + Performance
-- Run AFTER the main schema (001_initial_schema.sql)
-- ============================================================

-- ============================================================
-- 1. FIX: Volatile function in index predicate
-- ============================================================

-- NOW() is VOLATILE — cannot be used in partial index predicates.
-- Drop the bad index, recreate without the time filter.
-- The time filter belongs in the QUERY, not the index.

DROP INDEX IF EXISTS public.idx_sh_recent;

CREATE INDEX idx_sh_recent
  ON public.search_history(user_id, category_id, created_at DESC);

-- NOTE: Your query still filters recent rows at runtime:
--   WHERE created_at > NOW() - INTERVAL '30 days'
-- Postgres will use this index and apply the filter efficiently.

-- ============================================================
-- 2. PERFORMANCE: Missing critical indexes
-- ============================================================

-- 2a. worker_locations: stale location filter
-- Matching query filters: wl.updated_at > NOW() - INTERVAL '2 minutes'
-- Without this index, every matching round does a full scan of worker_locations.
CREATE INDEX IF NOT EXISTS idx_wl_updated_at
  ON public.worker_locations(updated_at DESC);

-- 2b. jobs: user active job lookup (common mobile query)
CREATE INDEX IF NOT EXISTS idx_jobs_user_status
  ON public.jobs(user_id, status, created_at DESC);

-- 2c. job_worker_requests: worker pending requests
-- Worker app polls for incoming job requests — this is the hot path.
CREATE INDEX IF NOT EXISTS idx_jwr_worker_pending
  ON public.job_worker_requests(worker_id, status, expires_at)
  WHERE status = 'pending';

-- 2d. notifications: unread count per user (badge rendering)
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE is_read = false;

-- 2e. jobs: discovery scheduled jobs (future bookings)
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled
  ON public.jobs(category_id, scheduled_at)
  WHERE scheduled_at IS NOT NULL
    AND status IN ('assigned', 'requested');

-- 2f. chats: lookup by job_id (common join in job status screens)
CREATE INDEX IF NOT EXISTS idx_chats_job
  ON public.chats(job_id);

-- 2g. payouts: worker pending payout total
CREATE INDEX IF NOT EXISTS idx_payouts_worker_pending
  ON public.payouts(worker_id, status)
  WHERE status = 'pending';

-- 2h. reviews: worker average rating calculation
CREATE INDEX IF NOT EXISTS idx_reviews_worker_rating
  ON public.reviews(worker_id, rating)
  WHERE is_visible = true;

-- 2i. worker_profiles: discovery browse (all approved, by rating)
CREATE INDEX IF NOT EXISTS idx_wp_discovery
  ON public.worker_profiles(avg_rating DESC, total_jobs_completed DESC)
  WHERE verification_status = 'approved'
    AND is_discovery_available = true;

-- 2j. offers: lookup by promo code (checkout validation)
CREATE INDEX IF NOT EXISTS idx_offers_promo
  ON public.offers(promo_code)
  WHERE promo_code IS NOT NULL AND is_active = true;

-- 2k. support_tickets: admin queue (open + high priority)
CREATE INDEX IF NOT EXISTS idx_st_admin_queue
  ON public.support_tickets(priority, created_at)
  WHERE status IN ('open', 'in_progress');

-- 2l. messages: latest message per chat (chat list preview)
CREATE INDEX IF NOT EXISTS idx_msg_chat_latest
  ON public.messages(chat_id, created_at DESC)
  WHERE is_deleted = false;

-- ============================================================
-- 3. PERFORMANCE: Row-level vacuuming for high-churn tables
-- ============================================================

-- worker_locations: upserted every 5 seconds per online worker.
-- Default autovacuum is too slow for this write rate.
ALTER TABLE public.worker_locations
  SET (
    autovacuum_vacuum_scale_factor = 0.01,   -- vacuum after 1% dead rows
    autovacuum_analyze_scale_factor = 0.01,
    autovacuum_vacuum_cost_delay = 2          -- faster vacuum cycles
  );

-- job_worker_requests: high insert rate during active periods
ALTER TABLE public.job_worker_requests
  SET (
    autovacuum_vacuum_scale_factor = 0.02,
    autovacuum_analyze_scale_factor = 0.02
  );

-- location_history: append-only, high volume
ALTER TABLE public.location_history
  SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
  );

-- ============================================================
-- 4. PERFORMANCE: Fill factor for hot update tables
-- ============================================================

-- worker_profiles: status + location updated frequently.
-- Lower fill_factor = fewer page splits on UPDATE.
ALTER TABLE public.worker_profiles SET (fillfactor = 70);

-- jobs: status transitions on every job lifecycle event
ALTER TABLE public.jobs SET (fillfactor = 75);

-- payments: status transitions (pending → held → released)
ALTER TABLE public.payments SET (fillfactor = 80);

-- ============================================================
-- 5. GRANTS: Expose tables to Supabase Data API
-- ============================================================
-- Without explicit grants, anon/authenticated roles cannot
-- access tables via the Supabase REST/GraphQL Data API,
-- even if RLS policies exist.
--
-- Rule: Grant SELECT only on public-read tables.
-- Authenticated-only tables get authenticated role.
-- Never grant to anon on sensitive tables.

-- Public (no auth) tables
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.tags TO anon, authenticated;
GRANT SELECT ON public.pune_areas TO anon, authenticated;
GRANT SELECT ON public.platform_config TO anon, authenticated;
GRANT SELECT ON public.worker_profiles TO anon, authenticated;
GRANT SELECT ON public.worker_categories TO anon, authenticated;
GRANT SELECT ON public.worker_locations TO anon, authenticated;
GRANT SELECT ON public.services TO anon, authenticated;
GRANT SELECT ON public.service_media TO anon, authenticated;
GRANT SELECT ON public.packages TO anon, authenticated;
GRANT SELECT ON public.package_services TO anon, authenticated;
GRANT SELECT ON public.offers TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;

-- Authenticated-only tables (RLS enforces row ownership)
GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_tags TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_media TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.worker_locations TO authenticated;
GRANT SELECT, INSERT ON public.location_history TO authenticated;
GRANT SELECT, INSERT ON public.jobs TO authenticated;
GRANT UPDATE ON public.jobs TO authenticated;
GRANT SELECT ON public.job_worker_requests TO authenticated;
GRANT UPDATE ON public.job_worker_requests TO authenticated;
GRANT SELECT ON public.job_events TO authenticated;
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT UPDATE ON public.reviews TO authenticated;
GRANT SELECT ON public.payments TO authenticated;
GRANT SELECT ON public.payouts TO authenticated;
GRANT SELECT ON public.chats TO authenticated;
GRANT SELECT, INSERT ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON public.support_messages TO authenticated;
GRANT SELECT, INSERT ON public.sos_events TO authenticated;
GRANT SELECT ON public.cancellation_penalties TO authenticated;
GRANT SELECT, INSERT ON public.search_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;
GRANT SELECT ON public.worker_analytics TO authenticated;

-- Sequence grants for bigserial tables
GRANT USAGE ON SEQUENCE public.location_history_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.job_events_id_seq TO authenticated;

-- ============================================================
-- 6. FUNCTION: Reusable commission calculator
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_job_type TEXT,
  p_amount   NUMERIC
) RETURNS TABLE (
  commission_rate NUMERIC,
  platform_fee    NUMERIC,
  gst_on_fee      NUMERIC,
  worker_payout   NUMERIC
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_instant_rate  NUMERIC;
  v_min_rate      NUMERIC;
  v_max_rate      NUMERIC;
  v_scale         NUMERIC;
  v_gst_rate      NUMERIC;
  v_rate          NUMERIC;
  v_fee           NUMERIC;
  v_gst           NUMERIC;
BEGIN
  -- Read config (cached per transaction by STABLE)
  SELECT value::NUMERIC INTO v_instant_rate FROM public.platform_config WHERE key = 'instant_commission_rate';
  SELECT value::NUMERIC INTO v_min_rate     FROM public.platform_config WHERE key = 'discovery_commission_min_rate';
  SELECT value::NUMERIC INTO v_max_rate     FROM public.platform_config WHERE key = 'discovery_commission_max_rate';
  SELECT value::NUMERIC INTO v_scale        FROM public.platform_config WHERE key = 'discovery_commission_scale_amount';
  SELECT value::NUMERIC INTO v_gst_rate     FROM public.platform_config WHERE key = 'gst_rate';

  IF p_job_type = 'instant' THEN
    v_rate := v_instant_rate;
  ELSE
    -- Linear interpolation: 10% at ₹0 → 15% at ₹50,000+
    v_rate := v_min_rate + (v_max_rate - v_min_rate) * LEAST(p_amount / v_scale, 1.0);
    v_rate := ROUND(v_rate, 4);
  END IF;

  v_fee := ROUND(p_amount * v_rate, 2);
  v_gst := ROUND(v_fee * v_gst_rate, 2);

  RETURN QUERY SELECT v_rate, v_fee, v_gst, ROUND(p_amount - v_fee - v_gst, 2);
END;
$$;

-- ============================================================
-- 7. FUNCTION: Update worker rating after review insert
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_worker_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.worker_profiles wp
  SET
    avg_rating   = sub.new_avg,
    rating_count = sub.new_count,
    updated_at   = NOW()
  FROM (
    SELECT
      AVG(rating)::NUMERIC(3,2) AS new_avg,
      COUNT(*)                  AS new_count
    FROM public.reviews
    WHERE worker_id = NEW.worker_id AND is_visible = true
  ) sub
  WHERE wp.id = NEW.worker_id;

  -- Also update service rating if review is for a specific service
  IF NEW.service_id IS NOT NULL THEN
    UPDATE public.services s
    SET
      avg_rating   = sub.new_avg,
      rating_count = sub.new_count,
      updated_at   = NOW()
    FROM (
      SELECT
        AVG(rating)::NUMERIC(3,2) AS new_avg,
        COUNT(*)                  AS new_count
      FROM public.reviews
      WHERE service_id = NEW.service_id AND is_visible = true
    ) sub
    WHERE s.id = NEW.service_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_review_insert
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_worker_rating();

-- ============================================================
-- 8. FUNCTION: Update worker job stats after job completion
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_worker_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire on status transition TO 'completed'
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.worker_id IS NOT NULL THEN
    UPDATE public.worker_profiles
    SET
      total_jobs_completed = total_jobs_completed + 1,
      total_earnings       = total_earnings + COALESCE(NEW.worker_payout, 0),
      pending_payout       = pending_payout + COALESCE(NEW.worker_payout, 0),
      cancellation_score   = LEAST(1.0, cancellation_score + 0.02),
      consecutive_rejects  = 0,
      updated_at           = NOW()
    WHERE id = NEW.worker_id;

    -- Update analytics
    INSERT INTO public.worker_analytics (worker_id)
    VALUES (NEW.worker_id)
    ON CONFLICT (worker_id) DO UPDATE SET
      total_jobs     = worker_analytics.total_jobs + 1,
      total_earnings = worker_analytics.total_earnings + COALESCE(NEW.worker_payout, 0),
      today_jobs     = CASE
        WHEN worker_analytics.updated_at::date = CURRENT_DATE
        THEN worker_analytics.today_jobs + 1 ELSE 1 END,
      today_earnings = CASE
        WHEN worker_analytics.updated_at::date = CURRENT_DATE
        THEN worker_analytics.today_earnings + COALESCE(NEW.worker_payout, 0)
        ELSE COALESCE(NEW.worker_payout, 0) END,
      updated_at     = NOW();
  END IF;

  -- Fire on status transition TO 'cancelled' by worker
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled'
     AND NEW.cancelled_by = 'worker' AND NEW.worker_id IS NOT NULL THEN
    UPDATE public.worker_profiles
    SET
      cancellation_score = GREATEST(0.0, cancellation_score - 0.10),
      updated_at         = NOW()
    WHERE id = NEW.worker_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_job_status_change
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_worker_stats();

-- ============================================================
-- 9. FUNCTION: Auto-reset worker to offline when job completes
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_worker_on_job_end()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled', 'failed')
     AND OLD.status NOT IN ('completed', 'cancelled', 'failed')
     AND NEW.worker_id IS NOT NULL THEN
    UPDATE public.worker_profiles
    SET status = 'online', updated_at = NOW()
    WHERE id = NEW.worker_id AND status = 'busy';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_job_end_release_worker
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.release_worker_on_job_end();

-- ============================================================
-- 10. VIEW: Worker public card (avoids N+1 joins on listing)
-- ============================================================

CREATE OR REPLACE VIEW public.worker_cards WITH (security_invoker = true) AS
  SELECT
    wp.id,
    wp.user_id,
    u.full_name,
    u.avatar_url,
    wp.bio,
    wp.experience_years,
    wp.pune_area,
    wp.status,
    wp.verification_status,
    wp.avg_rating,
    wp.rating_count,
    wp.total_jobs_completed,
    wp.acceptance_rate,
    wp.is_instant_available,
    wp.is_discovery_available,
    wp.service_radius_km,
    -- Primary category name (for card subtitle)
    c.name AS primary_category,
    c.color_hex AS primary_category_color,
    c.icon_name AS primary_category_icon
  FROM public.worker_profiles wp
  JOIN public.users u ON u.id = wp.user_id
  LEFT JOIN public.worker_categories wc ON wc.worker_id = wp.id AND wc.is_primary = true
  LEFT JOIN public.categories c ON c.id = wc.category_id
  WHERE wp.verification_status = 'approved';

GRANT SELECT ON public.worker_cards TO anon, authenticated;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Run this to verify no volatile predicates remain:
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexdef ILIKE '%now()%' OR indexdef ILIKE '%current_timestamp%');
-- Should return 0 rows.
