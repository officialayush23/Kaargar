# KAARGAR — System Overview (current state, verified against code)

This document describes how Kaargar actually works today, based on reading the live code in
`BACKEND/` and `FRONTEND/` — not on any prior spec. Where a claim below could be wrong, it's
because the code disagreed with older docs and the code was trusted. If you find something here
that no longer matches the code, fix this file, don't restore the old wording.

For repo structure, hard build rules, and environment variables, see `CLAUDE.md`. This file is the
"how it actually behaves" doc.

---

## 1. What Kaargar is

A Pune-only, hyperlocal services marketplace with two booking modes:

- **Instant** — Uber-style real-time dispatch. Customer posts a job, the backend searches for
  nearby available workers in expanding radii and assigns the first one to accept.
- **Discovery** — browse-and-book. Customer picks a specific worker's profile and books either a
  fixed time slot from that worker's live calendar, or a multi-day recurring booking (e.g. a daily
  security guard or maid for N consecutive days).

Backend: FastAPI + SQLAlchemy (async, asyncpg) + Supabase Postgres + PostGIS (for distance
queries) + Redis (Upstash, soft dependency) + APScheduler (in-process). Frontend: React + Vite +
JSX + Zustand + React Query + Supabase JS client for auth and Realtime.

---

## 2. Auth — Supabase email+password, not OTP

The frontend uses Supabase's own auth directly:

- Sign up: `supabase.auth.signUp({ email, password })` (`FRONTEND/src/pages/auth/LoginPage.jsx`)
  — Supabase sends a confirmation link email; there is no numeric OTP code anywhere in this flow.
- Sign in: `supabase.auth.signInWithPassword({ email, password })`.
- Forgot password: `supabase.auth.resetPasswordForEmail(...)`.

After Supabase issues a session, the frontend stores `session.access_token` as `kaargar_token`
(`FRONTEND/src/stores/auth.js`) and sends it as the Bearer token on every API call
(`FRONTEND/src/lib/api.js`). `App.jsx`'s `SupabaseAuthSync` component listens to
`onAuthStateChange` so the token stays fresh as Supabase auto-refreshes it.

On the backend, `BACKEND/dependencies.py::_decode_token()` validates that same Supabase JWT with
`SUPABASE_JWT_SECRET` (HS256, `verify_aud=False` since Supabase sets `aud='authenticated'`). The
backend **never signs its own JWT** — `jwt_secret_key`/`APP_SECRET_KEY` in `config.py` exists but
is unused dead config, kept in case auth is ever migrated off Supabase (`dependencies.py`'s
module docstring documents this as the intended swap point).

`BACKEND/routers/auth.py` has exactly three endpoints, none of which send or verify an OTP:
- `POST /auth/provision` — idempotently creates/updates the local `users` row from the Supabase
  JWT's `sub`/`email` claims. Called by the frontend right after a successful Supabase login,
  with a `role` hint (`'user'` or `'worker'`). Contains a one-way promotion guard: a `'user'` can
  be promoted to `'worker'` but never silently demoted.
- `GET /auth/me` — returns the DB user row, updates `last_seen_at`, and syncs `role` to
  `"worker"` if a `worker_profiles` row exists for that user.
- `POST /auth/logout` — a no-op; the real sign-out is `supabase.auth.signOut()` client-side.

---

## 3. Instant matching engine (`BACKEND/services/matching.py`)

Triggered as a background task after `POST /jobs` creates an `instant` job. High-level flow:

1. Acquire a Redis lock: `dispatch_lock:{job_id}`, `SET NX EX 30`. This is **live, not dead code**
   — it wraps the whole dispatch run and is released in a `finally` block. If Redis is
   unreachable, the code **fails open** (proceeds without the lock) rather than blocking dispatch.
2. Read tunable parameters from `platform_config` (via `services/config.get_config`), each with a
   hardcoded fallback matching the original design:
   - `dispatch_radius_start_km` → 2
   - `dispatch_radius_max_km` → 5
   - `dispatch_radius_step_km` → 1
   - `dispatch_accept_window_sec` → 10
   - `dispatch_max_workers_per_round` → 5
   So by default the radii walked are 2 → 3 → 4 → 5 km, exactly as originally specced, but an
   admin can now retune these live without a deploy.
3. For each radius, run a PostGIS-backed candidate query (online, approved, `is_instant_available`,
   not auto-offline, location fresh within 2 minutes, `ST_DWithin` the radius), ranked by:
   ```
   score = ( distance_term * 0.30
           + (avg_rating/5.0) * 0.20
           + acceptance_rate * 0.15
           + completion_rate * 0.15
           + response_time_term * 0.10
           + 0.10                         -- flat constant, not a live "price" term
           ) * cancellation_score
   ```
   Note: the flat `0.10` is a constant, not a price-based term — there is no live pricing signal
   in the ranking despite older docs describing a "price 10%" weight.
4. Create `job_worker_requests` for the top candidates (limit `dispatch_max_workers_per_round`),
   each with a 10-second expiry, and notify those workers (Supabase Realtime, via the
   `notifications` table insert workers subscribe to).
5. Poll every 500ms until the accept window closes, checking for any request marked `accepted`.
6. On acceptance: assign the job, set the worker `busy`, reset `consecutive_rejects`, create a
   `Chat` row, notify the customer. If the job's `quoted_price` is still null (can happen for
   service-linked instant jobs), it's backfilled from the service at this point — a documented
   fix for a prior bug where such jobs could reach completion with no price at all.
7. If a round's window closes with no acceptance, expire those requests and move to the next
   radius. If all radii are exhausted, the job is force-set to `status="failed"` and the customer
   is notified.

Commission/GST calculation (`calc_commission`, also in `matching.py`, called from `jobs.py`'s
completion logic) is DB-config-driven:

```python
if job_type == "instant":
    rate = get_config("commission_instant_rate", default=0.12)
else:  # discovery
    rate = get_config("commission_discovery_base", 0.10) \
         + get_config("commission_discovery_increment", 0.05) \
           * min(amount / get_config("commission_discovery_threshold", 50000), 1.0)
gst = fee * get_config("gst_rate", 0.18)
payout = amount - fee - gst
```

Note the instant commission default is **12%**, not 15% as in older docs — and every rate/
threshold is now a `platform_config` row with a hardcoded fallback, not a compile-time constant.
GST is charged on the platform's commission fee only, not on the full job amount, and there is no
Section 9(5) e-commerce-operator-specific GST treatment implemented — it's a flat
fee-plus-GST-on-fee model regardless of category. Commission and GST are deducted from the
worker's payout; the customer is never charged a separate platform fee.

---

## 4. Discovery booking flow — always pins a specific worker

There is **no auto-match path for Discovery.** The old design (worker chosen automatically by the
system after booking) was removed — `services/scheduling.py`'s module docstring notes the old
lazy-assignment code had no live caller anywhere in the app and was deleted. Every Discovery
booking requires `preferred_worker_id` up front and is created already `confirmed` against that
worker.

Two booking modes, both reachable only from `BookDiscoveryPage.jsx` against one worker's profile:

**Slot mode** (services flagged `requires_slot`) — the customer picks a specific published time
slot from a live weekly calendar:
- `GET /workers/{workerId}/services/{serviceId}/slots?from_date=&to_date=` populates a
  week-at-a-time calendar UI, grouping each day's slots into Morning/Afternoon/Evening buckets
  with remaining-capacity indicators.
- `POST /jobs/book-slot` locks the chosen `ServiceSlot` row with `SELECT ... FOR UPDATE`, checks
  it isn't blocked and isn't at capacity, then creates a `Job` with `worker_id` = the slot's owner
  and `status="confirmed"`. A DB trigger increments the slot's `booked_count` on commit. A 409 is
  returned (and the frontend clears the selection) if two customers race for the same slot.

**Multi-day / bundled mode** (services flagged `allow_multi_day_booking`) — the customer picks a
start date and a number of consecutive days (up to 60) plus one daily arrival window that applies
to every day:
- `POST /jobs/scheduled/multi-day` builds all N day-`Job` rows **in memory** first, then commits
  them **once, atomically**: day 1 is flushed alone to obtain its UUID (it becomes the "parent",
  `parent_job_id=NULL`, `day_index=1`, `total_days=N`), then every other day is stamped with
  `parent_job_id` = day 1's id and the whole remaining batch is added and flushed together. The
  final `db.commit()` is the single commit point for the entire bundle — either all N day-jobs
  exist, or (on any error, which rolls back) none of them do. There is no partial-bundle state
  reachable by a mid-way failure, and no per-day network round trip from the frontend (it's one
  API call for the whole range, not a loop).
- A separate plain "scheduled" endpoint, `POST /jobs/scheduled`, still exists for single fixed-
  window bookings (no slot, no multi-day) — it does not perform an availability check at creation
  time; availability is only checked later, at reschedule time.

Availability checking itself (`scheduling.py::check_worker_availability`) layers three checks:
recurring weekly hours, one-off time-off ranges, and manual schedule blocks. Reschedule calls it
with `require_weekly_hours=False`, deliberately, because a real production case (a 24-hour
security-guard booking with an unusual daily window) was getting false "not available" errors
against the worker's generic weekly-hours row.

---

## 5. Job lifecycle & completion (payment-gated)

Full endpoint set in `BACKEND/routers/jobs.py`: create → accept/reject (instant) or immediate
confirm (discovery) → `arrived` → `start` → completion → cancel/reschedule/no-show as applicable.

**Completion has two entry points that both funnel into the same finalize logic and the same
payment gate — this was previously a known risk and has since been hardened:**

- **Direct path:** `POST /jobs/{id}/complete` — the frontend does **not** call this anywhere
  (confirmed: no reference to it in `ActiveJobPage.jsx`, `JobCompletionFlow.jsx`, or
  `JobApprovalPage.jsx`). It still exists in the API and is guarded the same way as the flow below.
- **Actual UI flow:** worker uploads before/after photos and any extra line items
  (`POST /jobs/{id}/media`, `POST /jobs/{id}/items`) → `POST /jobs/{id}/submit-for-approval` →
  customer reviews via `GET /jobs/{id}/approval-summary` and either
  `POST /jobs/{id}/approve` or `POST /jobs/{id}/reject-approval` (the latter opens a dispute via
  the shared `SOSEvent` mechanism, see below) → once approved, the customer fetches a completion
  code (`GET /jobs/{id}/completion-code`) and reads it aloud to the worker → worker submits it via
  `POST /jobs/{id}/verify-otp` → job becomes `completed`.

Both entry points call a shared guard, `_require_payment_captured`, **before** they're allowed to
finalize — it requires a `Payment` row in `held` or `released` status for the job, and raises a
402 telling the caller to create a payment order first if not. Both `verify-otp` and
`completion-code` (the customer can't even see the code until this check passes) enforce it too.

The prior concern — "does the direct `/complete` path let a job finish with no price set?" — is
**not currently true**: a `Payment` row can only reach `held`/`released` if `create_order`
succeeded, which itself rejects (400 "Job price not set yet") if `approved_total`/`final_price`
is falsy. So in practice the payment-creation step is the real price gate; the completion path's
own `quoted_price`-fallback logic (used only if `final_price` isn't already set) is a secondary
safety net, not the primary defense, and there is no live path where a $0/unset-price job reaches
`completed` today. Code comments in `jobs.py` and `matching.py` document this as a fixed prior
bug, not an open one.

Payment itself (`ActiveJobPage.jsx`'s `PayNowButton`) only appears once `status === 'completed'`
— `POST /payments/create-order` → Razorpay checkout → `POST /payments/verify`. Note this means,
practically, completion actually happens through the OTP-verify call while payment is *already*
captured beforehand (the gate requires a `held`/`released` Payment before verify-otp will
succeed) — i.e. the customer pays (creating a `held` Payment via escrow) before the job can be
marked complete, not after.

---

## 6. Cancellation, reschedule, and no-show system

Two independent offense counters, both DB-config-driven with hardcoded fallbacks
(`services/penalties.py`, `routers/jobs.py`):

**Customer cancellation-offense counter** (`CancellationPenalty` rows, `charged_role='user'`):
- First offense ever is always forgiven (0% charge), win or lose on timing.
- `cancellation_late_cutoff_hours` (default **6 hours**): a repeat offender cancelling within 6
  hours of the scheduled arrival is blocked from self-service cancellation entirely — must go
  through support.
- `cancellation_repeat_offense_pct` (default **50%**): the charge applied to repeat offenses.
- The same counter and percentage are reused when a *worker* flags "customer wasn't there"
  (`POST /jobs/{id}/flag-customer-unavailable`) — it feeds the identical counter, not a separate
  one.
- Reschedule has its own free-window guard: `cancellation_free_reschedule_min_hours` (default
  **2 hours**) — rescheduling is blocked if the current arrival is under 2 hours away.

**Worker cancellation of an assigned job:**
- `cancellation_score_deduct` (default **0.10**) subtracted from `worker_profiles.cancellation_score`
  (floored at 0).
- `penalty_worker_cancel_amount` (default **₹100** flat) charged to the worker.
- The job is requeued (`status="scheduled"`, `worker_id=None`) rather than fully killed if it had
  remaining scheduled days; otherwise cancelled.
- On successful completion, `cancellation_score_recover` (default **0.02**) is added back per job,
  capped at 1.00 — this is the score's only recovery mechanism.
- `cancellation_score` is the same multiplier applied against a worker's dispatch ranking score in
  the matching engine (section 3): 1.0 = full ranking weight, 0.0 = effectively never dispatched.

**Worker no-show, GPS-validated** (`report-no-show`, `penalties.py`):
- First-ever confirmed no-show is forgiven; every subsequent one applies a flat **-0.5 star**
  rating penalty (`rating_penalty_total`), which is subtracted from the raw review average
  whenever ratings are recomputed (floored at 0), so the penalty survives future recalculations.
- GPS check: if the worker's location at arrival time (from `LocationHistory`, falling back to the
  live `WorkerLocation` row only if it's within a ±30 minute window of the target arrival time) is
  further than **0.5 km** from the job address, the no-show is **auto-confirmed** — job cancelled,
  customer can rebook free, worker penalty applied.
- If GPS shows the worker actually was close, or if there's no usable GPS evidence at all, the
  claim is **not** auto-resolved either way — it's escalated as a support ticket (`SOSEvent`) for
  a human to adjudicate.

**Auto-offline for repeated rejections:** `consecutive_rejects` increments per reject;
`auto_offline_reject_threshold` (default **5**) triggers `auto_offline_minutes` (default **5**) of
forced offline status. A background task (`tasks/decay_scores.py`, runs every minute) flips the
worker back online once the timer expires.

---

## 7. Admin-configurable `platform_config`

`platform_config` is a flat key/value table (`services/config.py`). `get_config(db, key,
default)` always falls back to the hardcoded default if the row is missing or unparseable — by
design, nothing in the app should ever hard-fail because an admin hasn't set a row. There's a
60-second process-local cache (no cross-process invalidation needed since there's a single
FastAPI process and no external job queue).

Config keys found in active use, with their hardcoded fallback if unset:

| Key | Default | Controls |
|---|---|---|
| `dispatch_radius_start_km` / `_max_km` / `_step_km` | 2 / 5 / 1 | instant dispatch search radii |
| `dispatch_accept_window_sec` | 10 | seconds a worker has to accept an instant job |
| `dispatch_max_workers_per_round` | 5 | how many workers get notified per radius round |
| `commission_instant_rate` | 0.12 | instant job commission rate |
| `commission_discovery_base` / `_increment` / `_threshold` | 0.10 / 0.05 / 50000 | discovery commission formula |
| `gst_rate` | 0.18 | GST on the commission fee |
| `cancellation_score_deduct` | 0.10 | worker cancellation score penalty |
| `penalty_worker_cancel_amount` | ₹100 | worker cancellation flat fee |
| `cancellation_late_cutoff_hours` | 6 | customer late-cancel block threshold |
| `cancellation_repeat_offense_pct` | 0.50 | customer repeat-offense charge % |
| `cancellation_score_recover` | 0.02 | per-completed-job score recovery |
| `cancellation_free_reschedule_min_hours` | 2 | reschedule free-window |
| `auto_offline_reject_threshold` | 5 | consecutive rejects before forced offline |
| `auto_offline_minutes` | 5 | forced-offline duration |
| `no_show_rating_penalty` | 0.50 stars | worker no-show rating hit |
| `no_show_proximity_km` | 0.5 | GPS distance to auto-confirm a no-show |
| `no_show_location_lookup_window_min` | 30 | how stale GPS evidence can be and still count |
| `completion_code_expiry_hours` | 4 | completion OTP validity window |
| `completion_code_max_attempts` / `_lockout_minutes` | 5 / 15 | OTP brute-force guard |
| `max_image_upload_mb` / `max_category_icon_mb` | 10 / 5 | upload size caps |
| `max_extra_items_per_job` | 20 | job-completion line-item cap |
| `slot_rolling_window_days` | 14 | how far ahead slot rows are auto-generated |

Admin can list/create/update/delete rows via `GET/POST/PATCH/DELETE /admin/config`
(`routers/admin.py`), all gated behind `require_admin`.

**Payout approval — not implemented.** Admin only has read endpoints: `GET /admin/payouts` (list)
and `GET /admin/payouts/summary` (totals by status). There is no `approve`, `process`, or
Razorpay-transfer-trigger endpoint anywhere. The only place a `Payout` row is ever created is the
background `escrow_release` task (runs every 5 minutes, flips due `held` payments to `released`
and inserts a `Payout` with `status="pending"`); nothing in the codebase advances a payout past
`"pending"`. This is a real gap if the business needs an actual payout-disbursement step, not just
record-keeping.

**Support/dispute system — real, not stubbed.** `routers/support.py` implements a genuine ticket
system: create/list/view tickets, threaded replies, and an admin resolve endpoint
(`PATCH /admin/tickets/{id}/resolve`). SOS events and disputed job approvals reuse the existing
`SOSEvent` table rather than a dedicated dispute table (a deliberate design choice, documented
in-code as "reuse the existing SOS/dispute mechanism rather than a new table") — but there's no
SOS-specific admin resolution endpoint separate from the general support-ticket queue, so SOS
events appear to be intended for pickup via that same ticket queue.

---

## 8. Real-time subscriptions (Supabase Realtime)

Actual channels found in the frontend (more than the original four-channel design):

| Channel | Table | Event | Used in |
|---|---|---|---|
| `notif:{userId}` | `notifications` | INSERT | `hooks/useNotifications.js` |
| `worker-requests:{workerId}` | `job_worker_requests` | INSERT | `WorkerDashboard.jsx` (incoming instant jobs) |
| `job:{jobId}` | `jobs` | UPDATE | `SearchingPage.jsx` **and** `ActiveJobPage.jsx` (two independent subscriptions, not shared) |
| `job-approval:{jobId}` | `jobs` | UPDATE | `JobApprovalPage.jsx` |
| `chat:{chatId}` | `messages` | INSERT | `ChatPage.jsx` |
| `worker-loc:{workerId}` | `worker_locations` | `*` (all events) | `JobTrackingMap.jsx` (live map tracking) |

---

## 9. Storage buckets — six, not two

`services/storage.py` defines six Supabase Storage buckets in active use, more than the original
two-bucket design:

```
BUCKET_PROFILE            = "profile_photos"
BUCKET_POSTS               = "worker_posts"
BUCKET_DOCUMENTS           = "documents"
BUCKET_VERIFICATION_VIDEO  = "verification_video_worker"
BUCKET_JOB_BEFORE_AFTER    = "job_before_after"
BUCKET_JOB_ITEM_PHOTOS     = "job_item_photos"
```

`ServiceMedia.cloudinary_url`/`cloudinary_id` column names are legacy from an earlier design that
used Cloudinary — no Cloudinary SDK or API calls remain anywhere in the codebase (verified by
grep); those columns now store Supabase Storage public URLs and paths, same as before.

---

## 10. What's done vs. what's remaining / known gaps

**Done and verified working end-to-end in code:**
- Supabase email+password auth, JWT validation, role provisioning.
- Instant dispatch engine with expanding radius, live-tunable config, Redis lock, scoring, commission calc.
- Discovery slot booking (with row-locked capacity checks) and atomic multi-day bundled bookings.
- Full job lifecycle including photo-backed completion, customer approval, OTP-gated finalize, and a payment gate that's actually enforced before completion.
- Cancellation/reschedule/no-show penalty system with GPS validation and dual offense counters.
- Admin-configurable platform_config with safe fallback defaults.
- A real support-ticket system with admin resolution.
- Three APScheduler background tasks (escrow release every 5 min, worker analytics/auto-offline restore every 1–15 min, slot rollover every 24h).
- Real-time updates across jobs, chat, notifications, incoming instant requests, and live worker location.

**Known gaps / things to flag:**
- **No payout disbursement workflow.** Admin can only view payouts, not approve/process/trigger a Razorpay transfer. If the business expects a manual or automated payout-release step, it doesn't exist yet.
- **`jwt_secret_key`/`APP_SECRET_KEY` is defined but unused** — harmless today, but don't assume it does anything; it's a placeholder for a possible future move off Supabase auth.
- **`MAP_BOX_API_KEY` (backend)** is defined in `config.py` but never read anywhere else in the backend — the backend uses Google Maps for geocoding, and the frontend has its own separate `VITE_MAPBOX_TOKEN` for map rendering. Likely dead config, safe to ignore or remove.
- **No SOS-specific admin resolution endpoint** — SOS/dispute events are real `SOSEvent` rows but appear to only be actionable through the general support-ticket admin queue, not a dedicated SOS view.
- **`BACKEND/BACKEND_SPEC.md`** (inside `BACKEND/`, not at repo root) is another stale doc describing the never-built custom-JWT flow — it was not part of this cleanup's required rename list, but it should be treated with the same skepticism as the archived legacy docs, or renamed/removed in a follow-up.
- Several other loose root-level docs (`README.md`, `TODO.md`, `IMPLEMENTATION_AUDIT.md`, `JOB_COMPLETION_FLOW_PLAN.md`, `KAARGAR_BACKEND_UPDATE.md`, `Kaargar_UI_CrossCheck.md`, and `FRONTEND/FRONTEND_UI_SPEC.md` / `FRONTEND_UPDATE.md`) were not verified line-by-line as part of this pass — treat them as working notes of unknown freshness, not verified references.

---

## 11. Environment variables — plain-language reference

See `CLAUDE.md` for the authoritative table (field names, aliases, defaults). In short:

**Backend:** database connection, three Supabase credentials (URL, anon key, service-role key —
service-role key is what lets the backend write to Storage buckets on the worker's behalf), the
Supabase JWT secret (the actual thing that makes auth work), an unused legacy app-secret key,
Redis URL (soft dependency — dispatch lock/translation cache/one lookup, all fail open), Razorpay
test key id/secret + webhook secret, Resend API key for outbound email, legacy SMTP fields,
Google Maps key (backend geocoding proxy), Groq API key (chat message translation), and a phone
cipher key (encrypts phone numbers shared between customer and worker so the raw number is never
persisted in chat).

**Frontend:** Supabase URL + anon key (client-side auth/Realtime), backend API base URL, Razorpay
public key, a Mapbox token (map rendering — previously missing from `.env.example`, now added),
and a phone cipher key matching the backend's (previously missing, now added) so the app can
decrypt the masked phone number for the in-app "call" feature.
