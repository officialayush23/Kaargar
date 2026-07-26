-- 013_service_catalog.sql
-- Admin-curated service catalog — the atomic bookable unit for Instant mode.
-- See SYSTEM_OVERVIEW.md §11 for the design rationale (profession = browsing
-- category only; service = what's actually matched/dispatched/priced).
--
-- Workers pick from this catalog when listing an Instant-mode service
-- (option 2 from the brainstorming session: curated list + reviewed custom
-- additions). Free-text `services` rows with no catalog_service_id remain
-- valid and continue to power Discover (packages/offers/free-form jobs),
-- which stays uncontrolled by design.

BEGIN;

CREATE TABLE IF NOT EXISTS service_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    icon_url TEXT,
    -- approved: visible to customers in Instant mode + selectable by workers.
    -- pending:  a worker-proposed addition, awaiting admin review — selectable
    --           only by the proposing worker (on their own services page),
    --           never shown in customer-facing Instant browsing.
    -- rejected: reviewed and declined; kept for audit trail, never shown.
    status VARCHAR(20) NOT NULL DEFAULT 'approved',
    submitted_by_worker_id UUID REFERENCES worker_profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- Aggregate "times availed" across ALL workers offering this catalog
    -- service — the ranking signal for the customer-facing service list.
    -- Distinct from services.total_bookings, which is per-worker.
    total_bookings INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_service_catalog_category ON service_catalog(category_id);
CREATE INDEX IF NOT EXISTS idx_service_catalog_status ON service_catalog(status);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS catalog_service_id UUID REFERENCES service_catalog(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_services_catalog_service ON services(catalog_service_id);

-- jobs.catalog_service_id: set for Instant-mode jobs created against the
-- curated catalog (the customer picked a specific service, not just a
-- profession). Distinct from jobs.service_id, which already means something
-- different — a specific WORKER's pinned Service row (Discovery bookings
-- always pin a specific worker; that FK stays as-is).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS catalog_service_id UUID REFERENCES service_catalog(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_catalog_service ON jobs(catalog_service_id);

COMMIT;
