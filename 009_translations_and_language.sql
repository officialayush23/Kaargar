-- ============================================================
-- Migration 009: Content translations + worker language pref
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Worker language preference
ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'hi', 'mr'));

-- 2. Content translations table
-- Stores translated text for any dynamic entity (service, package, offer, review)
CREATE TABLE IF NOT EXISTS content_translations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   VARCHAR(30) NOT NULL,   -- 'service' | 'package' | 'offer' | 'review'
  entity_id     UUID NOT NULL,
  language      VARCHAR(5)  NOT NULL CHECK (language IN ('en', 'hi', 'mr')),
  field         VARCHAR(50) NOT NULL,   -- 'title' | 'description' | 'name' | 'text'
  text          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (entity_type, entity_id, language, field)
);

-- Index for fast lookup by entity
CREATE INDEX IF NOT EXISTS idx_content_translations_entity
  ON content_translations (entity_type, entity_id, language);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_content_translation_ts()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_translation_ts ON content_translations;
CREATE TRIGGER trg_content_translation_ts
  BEFORE UPDATE ON content_translations
  FOR EACH ROW EXECUTE FUNCTION update_content_translation_ts();

-- RLS: service reads are public, writes only via service role
ALTER TABLE content_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translations_public_read" ON content_translations
  FOR SELECT USING (true);

-- Only backend (service role) writes translations
-- No authenticated-user insert policy needed — translations are written by backend only
