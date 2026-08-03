# KAARGAR — Deployment & Setup TODO

Living checklist — update in place as steps complete, same standing rule as `CLAUDE.md`/`SYSTEM_OVERVIEW.md`. Ayush executes every account/dashboard/service-setup step himself; Claude only writes the code and instructions.

---

## 1. Backend — carried over from this session

- [ ] Run `alembic stamp baseline_20260803` once against the live DB. From `BACKEND/`, with `DATABASE_URL_DIRECT` set:
  ```
  alembic stamp baseline_20260803
  ```
  Bookkeeping only — writes one row to `alembic_version`, does not touch schema. All future schema changes go through `alembic revision --autogenerate` after this.
- [x] Real Upstash Redis TCP URL wired into `backend.env` (`REDIS_URL=rediss://...`)
- [x] Celery + Celery Beat scaffolding built (`celery_app.py`, task wrappers in `tasks/`) — additive, APScheduler still running in parallel
- [x] **Security fix (2026-08-03): `documents` and `verification_video_worker` Storage buckets were `public=true`, bypassing their own owner/admin-only RLS policies — anyone with a file path could fetch a worker's KYC documents or identity-verification video with zero auth. Both flipped to `public=false`; `services/storage.py` now issues short-lived signed URLs for them instead (fresh on every read, never persisted). `admin.py` and `routers/workers.py` updated accordingly. The other 5 buckets (profile photos, worker posts, job photos, catalog icons) are intentionally public and were left untouched.**

## 2. Deploy Celery worker + beat to Render — DEFERRED

**Decision (2026-08-03): not doing this now.** APScheduler alone is enough for current volume. Revisit once there's enough cloud budget to justify the extra ~$14/mo for two Background Worker services — Celery/Beat code already exists and is ready to deploy whenever that happens, nothing further to build. Steps kept below for when that time comes.

Two new **Background Worker** services (not Cron Jobs — beat is a persistent process), both pointed at the same GitHub repo as the existing web service.

- [ ] **Root Directory / Build Command** — match the existing web service exactly (Root Directory `BACKEND`, Build Command `pip install -r requirements.txt`).
- [ ] **Worker service** — Start Command: `celery -A celery_app worker --loglevel=info --concurrency 2`
- [ ] **Beat service** — Start Command: `celery -A celery_app beat --loglevel=info`
- [ ] **Env vars** — copy the same env vars from the web service onto both (Render's "New Service" form has a paste-from-.env option). What matters: `REDIS_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Instance type** — Starter ($7/mo each = $14/mo total). Free tier exists but is risky here: free-tier spin-down assumes something wakes the service via an HTTP request, which never happens for a worker/beat process — it may not reliably wake back up.
- [ ] **Verify** — check both services' logs for Redis connecting and Beat firing on schedule. Confirm all three tasks actually run: `release_due_escrows_task`, `restore_auto_offline_workers_task` / `refresh_all_worker_analytics_task`, `roll_forward_slot_windows_task`.
- [ ] **Only after verifying** — remove `start_escrow_scheduler()` / `start_decay_scheduler()` / `start_slot_rollover_scheduler()` from `main.py`'s lifespan. Not before — APScheduler is the safety net until Celery is confirmed live.

Reference implementation: [render-examples/celery](https://github.com/render-examples/celery).

## 3. Local development with Docker — DEFERRED

**Decision (2026-08-03): not needed right now.** `BACKEND/Dockerfile` + `BACKEND/docker-compose.yml` already exist and work whenever local Docker dev is wanted later — local dev only either way, Render deploy is unaffected (still native Python, no Docker, per section 2 above).

- [ ] Copy `D:\Kaargar_App\backend.env` → `BACKEND\.env` (gitignored, stays local, never committed).
- [ ] From `BACKEND/`: `docker-compose up --build`
- [ ] This starts 4 containers: `redis` (local, not Upstash — compose overrides `REDIS_URL` so local runs never touch prod's Upstash instance or share task state with it), `api` (FastAPI on port 8000, `--reload` on), `celery_worker`, `celery_beat`.
- [ ] API reachable at `http://localhost:8000` on this machine — see section 4 for reaching it from a phone.
- [ ] Machine-specific tweaks (e.g. different port mapping) go in `docker-compose.override.yml` — already gitignored, Compose loads it automatically if present.

## 4. Mobile app: always points at the deployed backend — DECIDED

**Decision (2026-08-03): no local/dev URL switching.** The mobile app always talks to the deployed Render backend (`https://kaargar.onrender.com/v1`), in every environment — dev, preview, and the eventual Play Store build. This is already what `D:\Kaargar_App\kaargar\.env`'s `EXPO_PUBLIC_API_BASE_URL` is set to; nothing to change. No local backend run, no LAN IP, no Docker needed for mobile dev as a result.

(For the record, the reasoning against copying the backend into `Kaargar_App` still stands even though this makes it moot for now: `Kaargar_App` is its own separate git repo, and a backend doesn't need to live next to the mobile app on disk to be reachable — it's just an HTTP API at a URL.)

## 5. Roadmap — not started

- [ ] Build OTP send/verify endpoints (additive, Supabase stays primary auth)
- [ ] Extend `dependencies.py`'s auth check to also accept a self-issued OTP-session JWT
- [ ] Wire FCM push notifications (blocked on Firebase service-account credentials)
- [ ] Wire promo campaign CRUD + delivery (admin endpoints, models/schemas already exist)
- [ ] Design feature/entity-based module boundaries (auth/, worker/, customer/, booking/, payment/, notification/, support/, admin/)
- [ ] Incrementally migrate routers into the new feature modules, one at a time, verifying the app still boots after each move
