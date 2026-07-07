-- Kaargar Platform Config Seed
-- Run this in Supabase SQL Editor to populate platform settings.
-- All values can be updated live from the Admin → Config panel.

INSERT INTO platform_config (key, value, description) VALUES

-- ── Commission ─────────────────────────────────────────────────────
('commission_instant_rate',   '0.15',  'Platform commission for Instant jobs (15%)'),
('commission_discovery_base', '0.10',  'Base commission for Discovery bookings (10%)'),
('commission_discovery_max',  '0.15',  'Max commission for Discovery at ₹50,000+ (15%)'),

-- ── Tax ────────────────────────────────────────────────────────────
('gst_rate',                  '0.18',  'GST applied on platform commission (18%)'),

-- ── Worker Payouts ─────────────────────────────────────────────────
('payout_min_amount',         '100',   'Minimum payout withdrawal amount (₹)'),
('escrow_release_hours',      '24',    'Hours after job completion before escrow auto-releases'),

-- ── Cancellation Penalties ─────────────────────────────────────────
('penalty_worker_cancel',     '100',   'Penalty charged to worker for cancelling accepted job (₹)'),
('cancellation_score_deduct', '0.10',  'Score deducted from worker on cancellation'),
('cancellation_score_recover','0.02',  'Score recovered per completed job after cancellation'),
('auto_offline_rejections',   '5',     'Consecutive rejections before worker goes auto-offline'),
('auto_offline_minutes',      '5',     'Minutes worker stays auto-offline after threshold'),

-- ── Matching Engine ────────────────────────────────────────────────
('dispatch_radius_start_km',  '2',     'Starting search radius for instant job dispatch (km)'),
('dispatch_radius_max_km',    '5',     'Maximum search radius before job fails (km)'),
('dispatch_request_timeout_s','10',    'Seconds a worker has to accept/reject a job request'),
('dispatch_poll_interval_ms', '500',   'How often the dispatch loop polls for acceptance (ms)'),

-- ── Search & Discovery ─────────────────────────────────────────────
('search_results_per_page',   '20',    'Workers returned per search page'),
('score_weight_distance',     '0.30',  'Ranking: distance weight'),
('score_weight_rating',       '0.20',  'Ranking: rating weight'),
('score_weight_acceptance',   '0.15',  'Ranking: acceptance rate weight'),
('score_weight_completion',   '0.15',  'Ranking: completion rate weight'),
('score_weight_response',     '0.10',  'Ranking: response time weight'),
('score_weight_price',        '0.10',  'Ranking: price competitiveness weight'),

-- ── Platform Limits ────────────────────────────────────────────────
('otp_rate_limit_per_hour',   '5',     'Max OTP sends per email per hour'),
('loc_update_rate_limit_s',   '3',     'Min seconds between worker location updates'),
('max_active_jobs_per_user',  '3',     'Max simultaneous active jobs a user can have')

ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      description = EXCLUDED.description;
