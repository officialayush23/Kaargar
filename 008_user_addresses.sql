-- ============================================================
-- 008 — USER SAVED ADDRESSES
-- Run in Supabase SQL Editor after 007_slot_scheduling.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  label           VARCHAR(50)  NOT NULL,                  -- "Home", "Work", "Mom's place"
  address_line    TEXT         NOT NULL,                  -- full formatted address
  area            VARCHAR(100),                           -- e.g. "Kothrud"
  city            VARCHAR(100) NOT NULL DEFAULT 'Pune',
  lat             DECIMAL(9,6),
  lon             DECIMAL(9,6),
  place_id        VARCHAR(255),                           -- Google place_id for re-resolving

  is_default      BOOLEAN      NOT NULL DEFAULT false,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON public.user_addresses(user_id);

-- Only one default per user — enforced via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_default_address
  ON public.user_addresses(user_id)
  WHERE is_default = true;

-- RLS
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_addresses_owner" ON public.user_addresses;
CREATE POLICY "user_addresses_owner"
  ON public.user_addresses FOR ALL
  USING (auth.uid() = user_id);
