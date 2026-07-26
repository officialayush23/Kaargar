-- 014_service_catalog_base_price.sql
-- Per-service price floor/reference for the Instant catalog (migration 013).
-- A single profession-wide min_price (categories.min_price) doesn't hold up
-- once Instant is service-specific: "bulb change" and "full home rewiring"
-- under Electrician need very different floors. base_price is optional per
-- catalog service — falls back to the profession's min_price when unset
-- (see routers/workers.py price-floor validation, routers/categories.py
-- customer-facing display fallback).

BEGIN;

ALTER TABLE service_catalog
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2);

COMMIT;
