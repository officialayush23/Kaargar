-- ============================================================
-- Kaargar — Migration 005: Full Packages/Services/Offers Schema
-- Run after 004_fixes.sql
-- ============================================================

-- ── 1. SERVICES — add service_mode + visit_fee ──────────────
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS service_mode VARCHAR(10) NOT NULL DEFAULT 'both'
    CHECK (service_mode IN ('walkin', 'onsite', 'both')),
  ADD COLUMN IF NOT EXISTS visit_fee NUMERIC(10,2);

COMMENT ON COLUMN services.service_mode IS 'walkin=user comes to worker, onsite=worker goes to user, both=either';
COMMENT ON COLUMN services.visit_fee IS 'Extra fee charged when service_mode is onsite; NULL means included in price';

-- ── 2. PACKAGES — add redemption_type + validity_days ───────
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS redemption_type VARCHAR(30) NOT NULL DEFAULT 'multi_use'
    CHECK (redemption_type IN ('single_use_bundle', 'multi_use')),
  ADD COLUMN IF NOT EXISTS validity_days INTEGER;

COMMENT ON COLUMN packages.redemption_type IS 'single_use_bundle=all services in one job, multi_use=services redeemed individually over time';
COMMENT ON COLUMN packages.validity_days IS 'Days from purchase until expiry; NULL = never expires';

-- ── 3. PACKAGE_SERVICES — add redeem_type ───────────────────
ALTER TABLE package_services
  ADD COLUMN IF NOT EXISTS redeem_type VARCHAR(15) NOT NULL DEFAULT 'repeatable'
    CHECK (redeem_type IN ('once', 'repeatable'));

COMMENT ON COLUMN package_services.redeem_type IS 'once=redeemed in single session, repeatable=can be used quantity times separately';

-- ── 4. CREATE package_orders ─────────────────────────────────
CREATE TABLE IF NOT EXISTS package_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id    UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
  worker_id     UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE RESTRICT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  total_paid    NUMERIC(10,2) NOT NULL,
  expires_at    TIMESTAMPTZ,
  purchased_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_orders_user     ON package_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_package_orders_package  ON package_orders(package_id);
CREATE INDEX IF NOT EXISTS idx_package_orders_worker   ON package_orders(worker_id);
CREATE INDEX IF NOT EXISTS idx_package_orders_status   ON package_orders(status) WHERE status = 'active';

COMMENT ON TABLE package_orders IS 'When a user purchases a package from a worker';

-- ── 5. CREATE package_usages ─────────────────────────────────
CREATE TABLE IF NOT EXISTS package_usages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_order_id  UUID NOT NULL REFERENCES package_orders(id) ON DELETE CASCADE,
  service_id        UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,
  used_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_usages_order   ON package_usages(package_order_id);
CREATE INDEX IF NOT EXISTS idx_package_usages_service ON package_usages(package_order_id, service_id);
CREATE INDEX IF NOT EXISTS idx_package_usages_job     ON package_usages(job_id);

COMMENT ON TABLE package_usages IS 'Each row = one service redemption from a package order (linked to a completed job)';

-- ── 6. GRANT access (Supabase anon/service_role) ────────────
GRANT SELECT, INSERT, UPDATE ON package_orders TO authenticated;
GRANT SELECT ON package_orders TO anon;
GRANT SELECT, INSERT ON package_usages TO authenticated;
GRANT SELECT ON package_usages TO anon;

-- ── 7. Enable Realtime for package_orders (optional) ─────────
-- ALTER PUBLICATION supabase_realtime ADD TABLE package_orders;

-- ── DONE ─────────────────────────────────────────────────────
-- Apply in Supabase SQL editor after running 004_fixes.sql
