-- ============================================================
-- KAARGAR — Complete Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- 2. TABLES
-- ============================================================

-- 2.1 USERS
CREATE TABLE public.users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(254) NOT NULL UNIQUE,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  phone           VARCHAR(15),
  phone_verified  BOOLEAN NOT NULL DEFAULT false,
  full_name       VARCHAR(100),
  avatar_url      TEXT,
  role            VARCHAR(20) NOT NULL DEFAULT 'user',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_banned       BOOLEAN NOT NULL DEFAULT false,
  ban_reason      TEXT,
  referral_code   VARCHAR(12) UNIQUE,
  referred_by     UUID REFERENCES public.users(id),
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_phone ON public.users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_name_trgm ON public.users USING GIN(full_name gin_trgm_ops);

-- 2.2 OTP SESSIONS
CREATE TABLE public.otp_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier   VARCHAR(254) NOT NULL,
  type         VARCHAR(10) NOT NULL,
  otp_hash     VARCHAR(128) NOT NULL,
  purpose      VARCHAR(20) NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  is_used      BOOLEAN NOT NULL DEFAULT false,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_identifier ON public.otp_sessions(identifier, expires_at);

-- 2.3 CATEGORIES
CREATE TABLE public.categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  icon_name     VARCHAR(50),
  icon_emoji    VARCHAR(10),
  color_hex     VARCHAR(7),
  mode          VARCHAR(20) NOT NULL DEFAULT 'both',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  parent_id     UUID REFERENCES public.categories(id),
  min_price     DECIMAL(10,2) NOT NULL DEFAULT 50,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES public.users(id)
);

CREATE INDEX idx_categories_slug ON public.categories(slug);
CREATE INDEX idx_categories_mode ON public.categories(mode, sort_order) WHERE is_active = true;
CREATE INDEX idx_categories_search ON public.categories USING GIN(search_vector);

-- 2.4 TAGS
CREATE TABLE public.tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  category_id UUID REFERENCES public.categories(id),
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tags_category ON public.tags(category_id);
CREATE INDEX idx_tags_name_trgm ON public.tags USING GIN(name gin_trgm_ops);
CREATE INDEX idx_tags_usage ON public.tags(usage_count DESC);

-- 2.5 WORKER PROFILES
CREATE TABLE public.worker_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  bio                   TEXT,
  experience_years      INTEGER DEFAULT 0,
  pune_area             VARCHAR(100),
  status                VARCHAR(20) NOT NULL DEFAULT 'offline',
  verification_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason      TEXT,
  verified_at           TIMESTAMPTZ,
  is_instant_available  BOOLEAN NOT NULL DEFAULT false,
  is_discovery_available BOOLEAN NOT NULL DEFAULT true,
  service_radius_km     INTEGER NOT NULL DEFAULT 5,
  avg_rating            DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count          INTEGER NOT NULL DEFAULT 0,
  total_jobs_completed  INTEGER NOT NULL DEFAULT 0,
  total_jobs_accepted   INTEGER NOT NULL DEFAULT 0,
  total_jobs_requested  INTEGER NOT NULL DEFAULT 0,
  acceptance_rate       DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  completion_rate       DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  avg_response_time_sec INTEGER NOT NULL DEFAULT 0,
  cancellation_score    DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  consecutive_rejects   INTEGER NOT NULL DEFAULT 0,
  auto_offline_until    TIMESTAMPTZ,
  total_earnings        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pending_payout        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  payout_upi_id         VARCHAR(100),
  payout_bank_account   VARCHAR(20),
  payout_ifsc           VARCHAR(11),
  payout_account_name   VARCHAR(100),
  payout_verified       BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wp_user ON public.worker_profiles(user_id);
CREATE INDEX idx_wp_status ON public.worker_profiles(status, verification_status);
CREATE INDEX idx_wp_matching ON public.worker_profiles(
  avg_rating DESC, total_jobs_completed DESC, acceptance_rate DESC
) WHERE status = 'online' 
  AND verification_status = 'approved' 
  AND is_instant_available = true
  AND (auto_offline_until IS NULL OR auto_offline_until < NOW());

-- 2.6 WORKER DOCUMENTS
CREATE TABLE public.worker_documents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id        UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  type             VARCHAR(30) NOT NULL,
  cloudinary_url   TEXT NOT NULL,
  cloudinary_id    TEXT NOT NULL,
  file_size_kb     INTEGER,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  reviewed_by      UUID REFERENCES public.users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wd_worker ON public.worker_documents(worker_id);
CREATE INDEX idx_wd_pending ON public.worker_documents(status, created_at) WHERE status = 'pending';

-- 2.7 WORKER CATEGORIES (M2M)
CREATE TABLE public.worker_categories (
  worker_id    UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (worker_id, category_id)
);

CREATE INDEX idx_wc_cat ON public.worker_categories(category_id, worker_id);

-- 2.8 SERVICES
CREATE TABLE public.services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id        UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  category_id      UUID NOT NULL REFERENCES public.categories(id),
  title            VARCHAR(150) NOT NULL,
  description      TEXT,
  price            DECIMAL(10,2) NOT NULL,
  price_type       VARCHAR(20) NOT NULL DEFAULT 'fixed',
  duration_min     INTEGER,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  total_bookings   INTEGER NOT NULL DEFAULT 0,
  avg_rating       DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count     INTEGER NOT NULL DEFAULT 0,
  search_vector    TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
  ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_svc_worker ON public.services(worker_id) WHERE is_active = true;
CREATE INDEX idx_svc_category ON public.services(category_id, avg_rating DESC) WHERE is_active = true;
CREATE INDEX idx_svc_search ON public.services USING GIN(search_vector);
CREATE INDEX idx_svc_title_trgm ON public.services USING GIN(title gin_trgm_ops);

-- 2.9 SERVICE TAGS (M2M)
CREATE TABLE public.service_tags (
  service_id  UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, tag_id)
);

CREATE INDEX idx_st_tag ON public.service_tags(tag_id, service_id);

-- 2.10 SERVICE MEDIA
CREATE TABLE public.service_media (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id      UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  service_id     UUID REFERENCES public.services(id) ON DELETE SET NULL,
  type           VARCHAR(10) NOT NULL,
  cloudinary_url TEXT NOT NULL,
  cloudinary_id  TEXT NOT NULL,
  thumbnail_url  TEXT,
  caption        TEXT,
  duration_sec   INTEGER,
  file_size_mb   DECIMAL(8,2),
  width          INTEGER,
  height         INTEGER,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_featured    BOOLEAN NOT NULL DEFAULT false,
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sm_worker ON public.service_media(worker_id, sort_order);
CREATE INDEX idx_sm_service ON public.service_media(service_id, sort_order);
CREATE INDEX idx_sm_featured ON public.service_media(worker_id, is_featured) WHERE is_featured = true;

-- 2.11 PACKAGES
CREATE TABLE public.packages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id        UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  title            VARCHAR(150) NOT NULL,
  description      TEXT,
  original_price   DECIMAL(10,2) NOT NULL,
  discounted_price DECIMAL(10,2) NOT NULL,
  discount_percent DECIMAL(5,2) GENERATED ALWAYS AS (
    ROUND((1 - discounted_price / NULLIF(original_price, 0)) * 100, 2)
  ) STORED,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  valid_from       TIMESTAMPTZ,
  valid_until      TIMESTAMPTZ,
  total_bookings   INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.package_services (
  package_id  UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  service_id  UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (package_id, service_id)
);

CREATE INDEX idx_pkg_worker ON public.packages(worker_id) WHERE is_active = true;

-- 2.12 OFFERS
CREATE TABLE public.offers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id       UUID NOT NULL REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  service_id      UUID REFERENCES public.services(id),
  package_id      UUID REFERENCES public.packages(id),
  title           VARCHAR(150) NOT NULL,
  description     TEXT,
  discount_type   VARCHAR(20) NOT NULL,
  discount_value  DECIMAL(10,2) NOT NULL,
  min_order_value DECIMAL(10,2),
  promo_code      VARCHAR(30) UNIQUE,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ NOT NULL,
  usage_limit     INTEGER,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offers_active ON public.offers(worker_id, valid_until) WHERE is_active = true;

-- 2.13 WORKER LOCATIONS
CREATE TABLE public.worker_locations (
  worker_id   UUID PRIMARY KEY REFERENCES public.worker_profiles(id) ON DELETE CASCADE,
  lat         DECIMAL(10,8) NOT NULL,
  lon         DECIMAL(11,8) NOT NULL,
  accuracy_m  DECIMAL(8,2),
  heading     DECIMAL(5,2),
  speed_kmh   DECIMAL(8,2),
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wl_geom ON public.worker_locations USING GIST(geom);

-- 2.14 LOCATION HISTORY
CREATE TABLE public.location_history (
  id          BIGSERIAL PRIMARY KEY,
  worker_id   UUID NOT NULL REFERENCES public.worker_profiles(id),
  job_id      UUID,
  lat         DECIMAL(10,8) NOT NULL,
  lon         DECIMAL(11,8) NOT NULL,
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lh_job ON public.location_history(job_id, recorded_at DESC);
CREATE INDEX idx_lh_worker ON public.location_history(worker_id, recorded_at DESC);

-- 2.15 JOBS
CREATE TABLE public.jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id),
  worker_id         UUID REFERENCES public.worker_profiles(id),
  service_id        UUID REFERENCES public.services(id),
  package_id        UUID REFERENCES public.packages(id),
  category_id       UUID NOT NULL REFERENCES public.categories(id),
  offer_id          UUID REFERENCES public.offers(id),
  job_type          VARCHAR(20) NOT NULL,
  status            VARCHAR(30) NOT NULL DEFAULT 'requested',
  title             VARCHAR(200),
  description       TEXT,
  location_lat      DECIMAL(10,8) NOT NULL,
  location_lon      DECIMAL(11,8) NOT NULL,
  location_address  TEXT NOT NULL,
  location_area     VARCHAR(100),
  location_geom     GEOGRAPHY(POINT, 4326) NOT NULL,
  location_note     TEXT,
  scheduled_at      TIMESTAMPTZ,
  quoted_price      DECIMAL(10,2),
  final_price       DECIMAL(10,2),
  commission_rate   DECIMAL(5,4),
  platform_fee      DECIMAL(10,2),
  gst_on_fee        DECIMAL(10,2),
  worker_payout     DECIMAL(10,2),
  search_radius_km  DECIMAL(5,2),
  workers_notified  INTEGER NOT NULL DEFAULT 0,
  dispatch_rounds   INTEGER NOT NULL DEFAULT 0,
  job_photos        TEXT[],
  assigned_at       TIMESTAMPTZ,
  en_route_at       TIMESTAMPTZ,
  arrived_at        TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by      VARCHAR(20),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.location_history ADD CONSTRAINT fk_lh_job
  FOREIGN KEY (job_id) REFERENCES public.jobs(id);

CREATE INDEX idx_jobs_user ON public.jobs(user_id, created_at DESC);
CREATE INDEX idx_jobs_worker ON public.jobs(worker_id, created_at DESC) WHERE worker_id IS NOT NULL;
CREATE INDEX idx_jobs_active ON public.jobs(status, created_at)
  WHERE status IN ('requested','searching','assigned','en_route','arrived','started');
CREATE INDEX idx_jobs_category ON public.jobs(category_id, created_at DESC);
CREATE INDEX idx_jobs_geom ON public.jobs USING GIST(location_geom);

-- 2.16 JOB WORKER REQUESTS
CREATE TABLE public.job_worker_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id         UUID NOT NULL REFERENCES public.worker_profiles(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  radius_km         DECIMAL(5,2) NOT NULL,
  distance_km       DECIMAL(5,2),
  score_at_dispatch DECIMAL(6,4),
  notified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  responded_at      TIMESTAMPTZ,
  rejection_reason  VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jwr_job ON public.job_worker_requests(job_id, status);
CREATE INDEX idx_jwr_pending ON public.job_worker_requests(job_id, expires_at) WHERE status = 'pending';
CREATE INDEX idx_jwr_worker ON public.job_worker_requests(worker_id, created_at DESC);

-- 2.17 JOB EVENTS
CREATE TABLE public.job_events (
  id         BIGSERIAL PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  status     VARCHAR(30) NOT NULL,
  actor      VARCHAR(20) NOT NULL,
  actor_id   UUID NOT NULL,
  lat        DECIMAL(10,8),
  lon        DECIMAL(11,8),
  metadata   JSONB NOT NULL DEFAULT '{}',
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_je_job ON public.job_events(job_id, created_at);

-- 2.18 REVIEWS
CREATE TABLE public.reviews (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                UUID NOT NULL UNIQUE REFERENCES public.jobs(id),
  reviewer_id           UUID NOT NULL REFERENCES public.users(id),
  worker_id             UUID NOT NULL REFERENCES public.worker_profiles(id),
  service_id            UUID REFERENCES public.services(id),
  rating                DECIMAL(3,2) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  quality_rating        DECIMAL(3,2),
  punctuality_rating    DECIMAL(3,2),
  communication_rating  DECIMAL(3,2),
  value_rating          DECIMAL(3,2),
  text                  TEXT,
  photos                TEXT[],
  is_flagged            BOOLEAN NOT NULL DEFAULT false,
  flag_reason           TEXT,
  reply                 TEXT,
  reply_at              TIMESTAMPTZ,
  is_visible            BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rev_worker ON public.reviews(worker_id, created_at DESC) WHERE is_visible = true;
CREATE INDEX idx_rev_service ON public.reviews(service_id, rating DESC) WHERE is_visible = true;

-- 2.19 PAYMENTS
CREATE TABLE public.payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                UUID NOT NULL UNIQUE REFERENCES public.jobs(id),
  user_id               UUID NOT NULL REFERENCES public.users(id),
  amount                DECIMAL(10,2) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'INR',
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method        VARCHAR(20),
  razorpay_order_id     VARCHAR(60) UNIQUE,
  razorpay_payment_id   VARCHAR(60) UNIQUE,
  razorpay_signature    TEXT,
  held_at               TIMESTAMPTZ,
  escrow_release_due_at TIMESTAMPTZ,
  escrow_released_at    TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,
  refund_amount         DECIMAL(10,2),
  refund_reason         TEXT,
  last_webhook_event    VARCHAR(50),
  last_webhook_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pay_held ON public.payments(status, escrow_release_due_at) WHERE status = 'held';
CREATE INDEX idx_pay_user ON public.payments(user_id, created_at DESC);

-- 2.20 PAYOUTS
CREATE TABLE public.payouts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id             UUID NOT NULL REFERENCES public.worker_profiles(id),
  payment_id            UUID NOT NULL REFERENCES public.payments(id),
  job_id                UUID NOT NULL REFERENCES public.jobs(id),
  gross_amount          DECIMAL(10,2) NOT NULL,
  platform_fee          DECIMAL(10,2) NOT NULL,
  gst_on_fee            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tds_deducted          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount            DECIMAL(10,2) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  razorpay_transfer_id  VARCHAR(60),
  processed_at          TIMESTAMPTZ,
  failure_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_po_worker ON public.payouts(worker_id, created_at DESC);
CREATE INDEX idx_po_pending ON public.payouts(status, created_at) WHERE status = 'pending';

-- 2.21 CHATS
CREATE TABLE public.chats (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id      UUID NOT NULL UNIQUE REFERENCES public.jobs(id),
  user_id     UUID NOT NULL REFERENCES public.users(id),
  worker_id   UUID NOT NULL REFERENCES public.worker_profiles(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);

CREATE INDEX idx_chats_user ON public.chats(user_id, is_active);
CREATE INDEX idx_chats_worker ON public.chats(worker_id, is_active);

-- 2.22 MESSAGES
CREATE TABLE public.messages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id        UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES public.users(id),
  sender_role    VARCHAR(10) NOT NULL,
  type           VARCHAR(10) NOT NULL DEFAULT 'text',
  raw_content    TEXT,
  content        TEXT,
  media_url      TEXT,
  system_event   VARCHAR(50),
  is_read        BOOLEAN NOT NULL DEFAULT false,
  read_at        TIMESTAMPTZ,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msg_chat ON public.messages(chat_id, created_at);
CREATE INDEX idx_msg_unread ON public.messages(chat_id, is_read) WHERE is_read = false AND is_deleted = false;

-- 2.23 NOTIFICATIONS
CREATE TABLE public.notifications (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES public.users(id),
  type           VARCHAR(50) NOT NULL,
  title          VARCHAR(200) NOT NULL,
  body           TEXT NOT NULL,
  data           JSONB NOT NULL DEFAULT '{}',
  is_read        BOOLEAN NOT NULL DEFAULT false,
  read_at        TIMESTAMPTZ,
  email_sent     BOOLEAN NOT NULL DEFAULT false,
  email_sent_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

-- 2.24 SUPPORT TICKETS
CREATE TABLE public.support_tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID REFERENCES public.jobs(id),
  user_id       UUID NOT NULL REFERENCES public.users(id),
  worker_id     UUID REFERENCES public.worker_profiles(id),
  assigned_to   UUID REFERENCES public.users(id),
  type          VARCHAR(30) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  priority      VARCHAR(10) NOT NULL DEFAULT 'medium',
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL,
  resolution    TEXT,
  refund_amount DECIMAL(10,2),
  refund_status VARCHAR(20),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE public.support_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES public.users(id),
  sender_role VARCHAR(10) NOT NULL,
  content     TEXT NOT NULL,
  attachments TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_st_status ON public.support_tickets(status, priority, created_at) WHERE status NOT IN ('closed','resolved');
CREATE INDEX idx_st_job ON public.support_tickets(job_id);
CREATE INDEX idx_sm_ticket ON public.support_messages(ticket_id, created_at);

-- 2.25 SOS EVENTS
CREATE TABLE public.sos_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES public.jobs(id),
  triggered_by      UUID NOT NULL REFERENCES public.users(id),
  triggered_by_role VARCHAR(10) NOT NULL,
  lat               DECIMAL(10,8),
  lon               DECIMAL(11,8),
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  notes             TEXT,
  acknowledged_by   UUID REFERENCES public.users(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sos_active ON public.sos_events(status, created_at DESC) WHERE status = 'active';

-- 2.26 CANCELLATION PENALTIES
CREATE TABLE public.cancellation_penalties (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id       UUID NOT NULL REFERENCES public.jobs(id),
  charged_to   UUID NOT NULL REFERENCES public.users(id),
  charged_role VARCHAR(10) NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  reason       VARCHAR(100) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  waived_by    UUID REFERENCES public.users(id),
  waived_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cp_user ON public.cancellation_penalties(charged_to, status);

-- 2.27 SEARCH HISTORY
CREATE TABLE public.search_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES public.users(id),
  query             TEXT NOT NULL,
  detected_mode     VARCHAR(20),
  category_id       UUID REFERENCES public.categories(id),
  result_clicked_id UUID,
  result_type       VARCHAR(20),
  session_id        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sh_user ON public.search_history(user_id, created_at DESC);
CREATE INDEX idx_sh_recent ON public.search_history(user_id, category_id, created_at DESC)
  WHERE created_at > NOW() - INTERVAL '30 days';

-- 2.28 USER PREFERENCES
CREATE TABLE public.user_preferences (
  user_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  top_categories   JSONB NOT NULL DEFAULT '[]',
  top_tags         JSONB NOT NULL DEFAULT '[]',
  preferred_mode   VARCHAR(20) DEFAULT 'instant',
  home_lat         DECIMAL(10,8),
  home_lon         DECIMAL(11,8),
  home_address     TEXT,
  pune_area        VARCHAR(100),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.29 WORKER ANALYTICS
CREATE TABLE public.worker_analytics (
  worker_id               UUID PRIMARY KEY REFERENCES public.worker_profiles(id),
  total_earnings          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_jobs              INTEGER NOT NULL DEFAULT 0,
  month_earnings          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  month_jobs              INTEGER NOT NULL DEFAULT 0,
  week_earnings           DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  week_jobs               INTEGER NOT NULL DEFAULT 0,
  today_earnings          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  today_jobs              INTEGER NOT NULL DEFAULT 0,
  avg_job_value           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  avg_rating_30d          DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  cancellation_count_30d  INTEGER NOT NULL DEFAULT 0,
  top_category_id         UUID REFERENCES public.categories(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.30 PLATFORM CONFIG
CREATE TABLE public.platform_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES public.users(id)
);

-- 2.31 PUNE AREAS
CREATE TABLE public.pune_areas (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      VARCHAR(100) NOT NULL UNIQUE,
  lat       DECIMAL(10,8) NOT NULL,
  lon       DECIMAL(11,8) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 3. SAFE VIEW (excludes raw_content from messages)
-- ============================================================

CREATE VIEW public.messages_safe WITH (security_invoker = true) AS
  SELECT id, chat_id, sender_id, sender_role, type, content,
         media_url, system_event, is_read, read_at, created_at
  FROM public.messages WHERE is_deleted = false;

-- ============================================================
-- 4. FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.worker_profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payouts FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Sync user from Supabase Auth on signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, email_verified, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    COALESCE(NEW.raw_app_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE SET
    email_verified = COALESCE(NEW.email_confirmed_at IS NOT NULL, false),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ============================================================
-- 5. RLS POLICIES
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_worker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellation_penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pune_areas ENABLE ROW LEVEL SECURITY;

-- PUBLIC READ (no auth needed)
CREATE POLICY "categories_public_read" ON public.categories FOR SELECT USING (true);
CREATE POLICY "tags_public_read" ON public.tags FOR SELECT USING (true);
CREATE POLICY "pune_areas_public_read" ON public.pune_areas FOR SELECT USING (true);
CREATE POLICY "services_public_read" ON public.services FOR SELECT USING (is_active = true);
CREATE POLICY "service_media_public_read" ON public.service_media FOR SELECT USING (true);
CREATE POLICY "packages_public_read" ON public.packages FOR SELECT USING (is_active = true);
CREATE POLICY "package_services_public_read" ON public.package_services FOR SELECT USING (true);
CREATE POLICY "offers_public_read" ON public.offers FOR SELECT USING (is_active = true);
CREATE POLICY "reviews_public_read" ON public.reviews FOR SELECT USING (is_visible = true);
CREATE POLICY "worker_categories_public_read" ON public.worker_categories FOR SELECT USING (true);

-- USERS: self only
CREATE POLICY "users_self_read" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_self_update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- WORKER PROFILES: public read (for discovery), self write
CREATE POLICY "wp_public_read" ON public.worker_profiles FOR SELECT USING (true);
CREATE POLICY "wp_self_insert" ON public.worker_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wp_self_update" ON public.worker_profiles FOR UPDATE USING (auth.uid() = user_id);

-- WORKER DOCUMENTS: worker self only
CREATE POLICY "wd_self" ON public.worker_documents FOR ALL USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- WORKER LOCATIONS: worker self write, public read (for map dots, no personal info)
CREATE POLICY "wl_public_read" ON public.worker_locations FOR SELECT USING (true);
CREATE POLICY "wl_self_write" ON public.worker_locations FOR ALL USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- JOBS: user sees own, worker sees assigned
CREATE POLICY "jobs_user_read" ON public.jobs FOR SELECT USING (
  auth.uid() = user_id OR
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);
CREATE POLICY "jobs_user_insert" ON public.jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jobs_user_update" ON public.jobs FOR UPDATE USING (
  auth.uid() = user_id OR
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- JOB WORKER REQUESTS: worker sees own
CREATE POLICY "jwr_worker_read" ON public.job_worker_requests FOR SELECT USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- JOB EVENTS: job participants
CREATE POLICY "je_participants" ON public.job_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id AND (
      auth.uid() = j.user_id OR
      auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = j.worker_id)
    )
  )
);

-- CHATS + MESSAGES: participants only
CREATE POLICY "chats_participants" ON public.chats FOR SELECT USING (
  auth.uid() = user_id OR
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);
CREATE POLICY "messages_participants" ON public.messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.chats c
    WHERE c.id = chat_id AND (
      auth.uid() = c.user_id OR
      auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = c.worker_id)
    )
  )
);

-- NOTIFICATIONS: self only
CREATE POLICY "notif_self" ON public.notifications FOR ALL USING (auth.uid() = user_id);

-- PAYMENTS: user self + worker via job
CREATE POLICY "pay_self" ON public.payments FOR SELECT USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id AND auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = j.worker_id)
  )
);

-- PAYOUTS: worker self
CREATE POLICY "po_self" ON public.payouts FOR SELECT USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- SUPPORT: self
CREATE POLICY "st_self" ON public.support_tickets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sm_self" ON public.support_messages FOR ALL USING (auth.uid() = sender_id);

-- SEARCH HISTORY: self
CREATE POLICY "sh_self" ON public.search_history FOR ALL USING (auth.uid() = user_id);

-- USER PREFERENCES: self
CREATE POLICY "up_self" ON public.user_preferences FOR ALL USING (auth.uid() = user_id);

-- WORKER ANALYTICS: self
CREATE POLICY "wa_self" ON public.worker_analytics FOR SELECT USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- PLATFORM CONFIG: public read
CREATE POLICY "pc_public_read" ON public.platform_config FOR SELECT USING (true);

-- SOS: participants
CREATE POLICY "sos_participants" ON public.sos_events FOR ALL USING (
  auth.uid() = triggered_by OR
  EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id = job_id AND auth.uid() = j.user_id
  )
);

-- CANCELLATION PENALTIES: self
CREATE POLICY "cp_self" ON public.cancellation_penalties FOR SELECT USING (auth.uid() = charged_to);

-- OTP: service role only (FastAPI backend)
CREATE POLICY "otp_service_only" ON public.otp_sessions FOR ALL USING (false);

-- LOCATION HISTORY: job participants
CREATE POLICY "lh_participants" ON public.location_history FOR SELECT USING (
  job_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.jobs j WHERE j.id = job_id AND (
      auth.uid() = j.user_id OR
      auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = j.worker_id)
    )
  )
);

-- ADMIN BYPASS (add role = 'admin' in app_metadata)
-- Applied to key tables admin needs full access to
CREATE POLICY "admin_users" ON public.users FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_wp" ON public.worker_profiles FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_wd" ON public.worker_documents FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_jobs" ON public.jobs FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_pay" ON public.payments FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_po" ON public.payouts FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_st" ON public.support_tickets FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_sm" ON public.support_messages FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_sos" ON public.sos_events FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_cp" ON public.cancellation_penalties FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_notif" ON public.notifications FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_pc" ON public.platform_config FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_wa" ON public.worker_analytics FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_jwr" ON public.job_worker_requests FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');
CREATE POLICY "admin_je" ON public.job_events FOR ALL USING ((auth.jwt()->'app_metadata'->>'role') = 'admin');

-- SERVICES: worker can manage own
CREATE POLICY "svc_self_write" ON public.services FOR INSERT WITH CHECK (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);
CREATE POLICY "svc_self_update" ON public.services FOR UPDATE USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);
CREATE POLICY "svc_self_delete" ON public.services FOR DELETE USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- SERVICE MEDIA: worker can manage own
CREATE POLICY "sm_self_write" ON public.service_media FOR INSERT WITH CHECK (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);
CREATE POLICY "sm_self_update" ON public.service_media FOR UPDATE USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);
CREATE POLICY "sm_self_delete" ON public.service_media FOR DELETE USING (
  auth.uid() = (SELECT user_id FROM public.worker_profiles WHERE id = worker_id)
);

-- ============================================================
-- 6. SEED DATA
-- ============================================================

-- INSTANT MODE CATEGORIES
INSERT INTO public.categories (name, slug, icon_name, color_hex, mode, sort_order, min_price) VALUES
  ('Electrician',        'electrician',       'Zap',           '#F59E0B', 'instant',   1,  150),
  ('Plumber',            'plumber',           'Droplets',      '#3B82F6', 'instant',   2,  150),
  ('AC Repair',          'ac-repair',         'Wind',          '#06B6D4', 'instant',   3,  200),
  ('Carpenter',          'carpenter',         'Hammer',        '#92400E', 'instant',   4,  150),
  ('Appliance Repair',   'appliance-repair',  'WashingMachine','#7C3AED', 'instant',   5,  150),
  ('House Cleaning',     'house-cleaning',    'Sparkles',      '#10B981', 'instant',   6,  200),
  ('Painter',            'painter',           'Brush',         '#F97316', 'instant',   7,  300),
  ('Locksmith',          'locksmith',         'KeyRound',      '#6B7280', 'instant',   8,  150),
  ('Computer Repair',    'computer-repair',   'Laptop',        '#8B5CF6', 'instant',   9,  200),
  ('Pest Control',       'pest-control',      'Bug',           '#DC2626', 'instant',  10,  300),
  ('Handyman',           'handyman',          'Wrench',        '#78716C', 'instant',  11,  150),
  ('Moving Help',        'moving-help',       'PackageOpen',   '#0EA5E9', 'instant',  12,  300),
  ('Mechanic',           'mechanic',          'Car',           '#374151', 'instant',  13,  200),
  ('Furniture Assembly', 'furniture-assembly','Armchair',       '#B45309', 'instant',  14,  150);

-- DISCOVERY MODE CATEGORIES
INSERT INTO public.categories (name, slug, icon_name, color_hex, mode, sort_order, min_price) VALUES
  ('Photographer',       'photographer',      'Camera',        '#EC4899', 'discovery',  1, 500),
  ('Videographer',       'videographer',      'Video',         '#EF4444', 'discovery',  2, 800),
  ('Musician / Band',    'musician',          'Music',         '#8B5CF6', 'discovery',  3, 500),
  ('DJ',                 'dj',                'Disc3',         '#7C3AED', 'discovery',  4, 2000),
  ('Interior Designer',  'interior-designer', 'Home',          '#F59E0B', 'discovery',  5, 2000),
  ('Wedding Planner',    'wedding-planner',   'Heart',         '#EC4899', 'discovery',  6, 5000),
  ('Event Decorator',    'event-decorator',   'PartyPopper',   '#F97316', 'discovery',  7, 1500),
  ('Personal Trainer',   'personal-trainer',  'Dumbbell',      '#10B981', 'discovery',  8, 500),
  ('Yoga Instructor',    'yoga-instructor',   'Leaf',          '#34D399', 'discovery',  9, 400),
  ('Private Tutor',      'tutor',             'GraduationCap', '#3B82F6', 'discovery', 10, 300),
  ('Chef / Cook',        'chef',              'ChefHat',       '#F59E0B', 'discovery', 11, 800),
  ('Beautician',         'beautician',        'Scissors',      '#EC4899', 'discovery', 12, 300),
  ('Makeup Artist',      'makeup-artist',     'Sparkles',      '#A855F7', 'discovery', 13, 500),
  ('Mehndi Artist',      'mehndi',            'Hand',          '#EA580C', 'discovery', 14, 300),
  ('Catering Service',   'catering',          'UtensilsCrossed','#EAB308','discovery', 15, 2000),
  ('Security Guard',     'security',          'Shield',        '#1E40AF', 'both',      16, 500);

-- PLATFORM CONFIG
INSERT INTO public.platform_config (key, value, description) VALUES
  ('instant_commission_rate',             '0.15',   '15% flat for instant jobs'),
  ('discovery_commission_min_rate',       '0.10',   '10% min for discovery'),
  ('discovery_commission_max_rate',       '0.15',   '15% max for discovery'),
  ('discovery_commission_scale_amount',   '50000',  'Amount at which max rate applies'),
  ('gst_rate',                            '0.18',   '18% GST on platform fee'),
  ('escrow_release_hours',               '2',       'Hours before escrow auto-releases'),
  ('cancellation_penalty_user_inr',       '50',     'User cancel penalty INR'),
  ('cancellation_penalty_worker_inr',     '100',    'Worker cancel penalty INR'),
  ('matching_initial_radius_km',          '2',      'Start matching at 2km'),
  ('matching_max_radius_km',             '5',       'Max matching radius'),
  ('matching_radius_step_km',            '1',       'Radius expansion step'),
  ('matching_request_timeout_sec',       '10',      'Worker response window'),
  ('max_workers_per_dispatch',           '5',       'Workers notified per round'),
  ('cancellation_decay_on_cancel',        '0.10',   'Score deducted on worker cancel'),
  ('cancellation_recovery_per_job',       '0.02',   'Score recovered per completed job'),
  ('auto_offline_reject_threshold',       '5',       'Consecutive rejects before auto-offline'),
  ('auto_offline_duration_min',           '5',       'Auto-offline duration in minutes'),
  ('launch_city',                         'Pune',    'Active city'),
  ('launch_city_lat',                     '18.5204', 'Pune center lat'),
  ('launch_city_lon',                     '73.8567', 'Pune center lon');

-- PUNE AREAS
INSERT INTO public.pune_areas (name, lat, lon) VALUES
  ('Hinjewadi',       18.5912, 73.7383),
  ('Kothrud',         18.5074, 73.8068),
  ('Aundh',           18.5590, 73.8080),
  ('Baner',           18.5590, 73.7868),
  ('Wakad',           18.5999, 73.7577),
  ('Pimpri-Chinchwad',18.6279, 73.7998),
  ('Hadapsar',        18.5018, 73.9263),
  ('Kharadi',         18.5514, 73.9370),
  ('Viman Nagar',     18.5679, 73.9143),
  ('Kalyani Nagar',   18.5461, 73.9008),
  ('Koregaon Park',   18.5362, 73.8929),
  ('Camp',            18.5186, 73.8795),
  ('Shivajinagar',    18.5308, 73.8474),
  ('Deccan',          18.5190, 73.8440),
  ('Katraj',          18.4529, 73.8535),
  ('Kondhwa',         18.4660, 73.8911),
  ('Magarpatta',      18.5132, 73.9272),
  ('Sinhagad Road',   18.4780, 73.8220),
  ('Warje',           18.4860, 73.8050),
  ('Bavdhan',         18.5180, 73.7760);

-- ============================================================
-- 7. ENABLE REALTIME (for notifications, jobs, messages)
-- ============================================================
-- Run these in Supabase Dashboard → Database → Replication:
-- Enable Realtime for: notifications, jobs, messages, worker_locations, job_worker_requests

-- Or via SQL:
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_worker_requests;
