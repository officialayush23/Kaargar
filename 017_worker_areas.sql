-- 017_worker_areas.sql
-- Lets a worker pick which named Pune areas (pune_areas) they're responsible
-- for. Instant-mode dispatch is filtered strictly to this list: a job whose
-- location resolves (nearest-centroid) to an area the worker hasn't selected
-- is never offered to them, no matter how close they physically are. A
-- worker with zero rows here gets zero Instant jobs until they pick at least
-- one area — deliberate, per product decision (favors precise coverage over
-- silently dispatching workers outside their claimed zone).
--
-- Discovery is untouched by this table — Discovery bookings always pin a
-- specific worker chosen by the customer, so there's no dispatch-time
-- filtering to apply areas to.
--
-- Distinct from the existing WorkerProfile.pune_area (a single free-text
-- display field set at onboarding) — that field is left as-is; this is a
-- new, structured, multi-valued, FK-backed list used only for matching.
CREATE TABLE IF NOT EXISTS worker_areas (
    worker_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
    area_id   UUID NOT NULL REFERENCES pune_areas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (worker_id, area_id)
);
CREATE INDEX IF NOT EXISTS idx_worker_areas_worker ON worker_areas(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_areas_area ON worker_areas(area_id);
