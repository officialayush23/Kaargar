# Kaargar Implementation Audit (vs `KAARGAR_SYSTEM_DESIGN_v2.md` + `CLAUDE.md`)

## What is implemented

### Backend foundation
- Core files exist and are wired: `main.py`, `config.py`, `database.py`, `models.py`, `schemas.py`, `dependencies.py`.
- All major routers from `CLAUDE.md` exist and are mounted under `/v1`:
  - `auth`, `categories`, `jobs`, `workers`, `search`, `chat`, `payments`, `reviews`, `notifications`, `upload`, `admin`.
- Services exist:
  - `services/matching.py` (instant dispatch loop + ranking + radius expansion).
  - `services/storage.py` (Supabase Storage upload/delete/public URL helpers).
  - `services/notifications.py` (DB notifications + SMTP OTP email).
- APScheduler tasks exist:
  - `tasks/escrow_release.py`
  - `tasks/decay_scores.py`
- Phone/email masking in chat is implemented server-side (`routers/chat.py`).
- Razorpay order + webhook + payment lookup endpoints are implemented.

### Frontend foundation
- React + Vite + JSX structure is present (no `.ts/.tsx` files found in `FRONTEND`).
- Core app wiring is present (`main.jsx`, `App.jsx`, routing, auth guards, layouts).
- Priority pages exist:
  - `LoginPage`, `HomePage`, `WorkerDashboard`, `IncomingJobModal`, `NewJobPage`, `SearchingPage`, `ActiveJobPage`, `WorkerMedia`, `WorkerProfile`, `DiscoveryPage`.
- Upload UI exists and calls backend upload routes:
  - `ProfilePhotoUpload`, `WorkerPostUpload` in `components/kaargar/MediaUpload.jsx`.
- Supabase Realtime subscriptions are present in frontend for:
  - notifications, job updates, chat messages, worker incoming requests.

### Static syntax status
- Python syntax check (Pylance) reports **no syntax errors** in sampled core backend files (`main.py`, routers, services, models, schemas, tasks).


## Not yet implemented / missing vs design docs

## API and modules missing (from `KAARGAR_SYSTEM_DESIGN_v2.md`)
- **Users API missing**:
  - `GET /users/me`, `PATCH /users/me`, `GET/PUT /users/me/preferences`.
- **Support system API missing**:
  - `POST /support/tickets`, `GET /support/tickets`, `GET /support/tickets/:id`, `POST /support/tickets/:id/messages`.
- **Admin support endpoints missing**:
  - `GET /admin/support/tickets`, `PATCH /admin/support/:id`, `POST /admin/support/:id/messages`.
- **Additional admin endpoints missing**:
  - `GET /admin/jobs`, `POST /admin/workers/:id/suspend`.
- **Additional worker APIs missing** (design-v2 scope):
  - packages/offers management, worker jobs feed, earnings endpoint, media patch endpoint.
- **Auth flows missing** (design-v2 scope):
  - refresh token flow (`/auth/refresh`) and logout endpoint.
- `GET /search/workers` endpoint (design-v2) is missing.
- `POST /payments/:job_id/dispute` endpoint (design-v2) is missing.

### Frontend pages/routes missing
- No `/support` page/route, although UI links to it (Home profile menu).
- No dedicated admin panel frontend implementation under `FRONTEND`.

### Template coverage
- Only one email template exists: `BACKEND/templates/email/otp.html`.
- Additional template set described in design is not present.


## Errors and mismatches found

## Critical integration/config errors
1. **Environment variable alias mismatch in backend config** (`BACKEND/config.py`):
   - Uses aliases like `ENVIRONMENT`, `APP_SECRET_KEY`, `RAZORPAY_TEST_KEY_ID`.
   - Spec/docs expect keys like `APP_ENV`, `JWT_SECRET_KEY`, `RAZORPAY_KEY_ID`.
   - This can break startup/auth/payment key loading in real envs.

2. **Job event logging bug in jobs router**:
   - `routers/jobs.py` creates `JobEvent(..., metadata=...)`.
   - Model defines attribute `meta` mapped to DB column `"metadata"` (`models.py`).
   - Result: runtime failure when writing job events.

3. **Frontend ↔ backend response shape mismatches (multiple pages)**:
   - `DiscoveryPage.jsx` expects `data.results`, but backend `/search` returns a list.
   - Job UI expects fields not in backend `JobResponse`, e.g. `assigned_worker`, `worker`, `client`, `chat_id`, `final_amount`, `budget_max`.
   - `WorkerProfilePage.jsx` expects nested `worker.worker_profile` and fields like `hourly_rate`, but backend returns flat `WorkerPublicResponse`.
   - Worker analytics UI expects fields like `earnings_today/jobs_today/acceptance_rate/cancellation_score`, while backend schema returns `today_earnings/today_jobs/...` subset.

4. **Worker realtime filter likely wrong** (`WorkerDashboard.jsx`):
   - Subscribes `job_worker_requests` with `worker_id=eq.${user.id}`.
   - `job_worker_requests.worker_id` references `worker_profiles.id`, not `users.id`.
   - Incoming job modal may never trigger for workers.

5. **Broken navigation route**:
   - Home menu links to `/support`, but app has no such route/page.

## Medium severity issues
1. `require_worker` dependency currently does not enforce worker profile/role (`dependencies.py`).
2. Several broad `except Exception: pass` blocks (OTP rate limit, location updates, Redis locks) hide failures silently.
3. `WorkerProfile` frontend sends fields (`area`, `min_rate`, `max_rate`, `years_experience`, `instant_available`) that do not match backend `WorkerProfileUpdate` schema (`pune_area`, `experience_years`, `is_instant_available`).
4. `WorkerCard` uses `<Avatar src=... name=... />` but this Avatar component expects `AvatarImage` child; images may not render in this card.


## Notes on design-doc alignment
- The repository aligns strongly with the reduced scope in `CLAUDE.md` (core backend + key frontend screens).
- `KAARGAR_SYSTEM_DESIGN_v2.md` has a broader API surface (users/support/packages/offers/admin-support) that is still incomplete.
