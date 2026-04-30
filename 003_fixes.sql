-- ============================================================
-- KAARGAR — Schema Patch 003: UI & Auth Alignments
-- ============================================================

-- 1. Add budget fields to jobs table (expected by frontend UI)
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS budget_max DECIMAL(10,2);

-- 2. Add base rate fields to worker_profiles (expected by frontend onboarding)
ALTER TABLE public.worker_profiles 
ADD COLUMN IF NOT EXISTS min_rate DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS max_rate DECIMAL(10,2);

-- 3. Create refresh_tokens table for the /auth/refresh flow
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  token       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user 
ON public.refresh_tokens(user_id, revoked);

-- 4. RLS for refresh_tokens (Service role / Backend only)
ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refresh_tokens_service_only" ON public.refresh_tokens FOR ALL USING (false);