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

## 2. Deploy Celery worker + beat to Render

Two new **Background Worker** services (not Cron Jobs — beat is a persistent process), both pointed at the same GitHub repo as the existing web service.

- [ ] **Root Directory / Build Command** — match the existing web service exactly (Root Directory `BACKEND`, Build Command `pip install -r requirements.txt`).
- [ ] **Worker service** — Start Command: `celery -A celery_app worker --loglevel=info --concurrency 2`
- [ ] **Beat service** — Start Command: `celery -A celery_app beat --loglevel=info`
- [ ] **Env vars** — copy the same env vars from the web service onto both (Render's "New Service" form has a paste-from-.env option). What matters: `REDIS_URL`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Instance type** — Starter ($7/mo each = $14/mo total). Free tier exists but is risky here: free-tier spin-down assumes something wakes the service via an HTTP request, which never happens for a worker/beat process — it may not reliably wake back up.
- [ ] **Verify** — check both services' logs for Redis connecting and Beat firing on schedule. Confirm all three tasks actually run: `release_due_escrows_task`, `restore_auto_offline_workers_task` / `refresh_all_worker_analytics_task`, `roll_forward_slot_windows_task`.
- [ ] **Only after verifying** — remove `start_escrow_scheduler()` / `start_decay_scheduler()` / `start_slot_rollover_scheduler()` from `main.py`'s lifespan. Not before — APScheduler is the safety net until Celery is confirmed live.

Reference implementation: [render-examples/celery](https://github.com/render-examples/celery).

## 3. Local development with Docker (new)

`BACKEND/Dockerfile` + `BACKEND/docker-compose.yml` now exist — local dev only, Render deploy is unaffected (still native Python, no Docker, per section 2 above).

- [ ] Copy `D:\Kaargar_App\backend.env` → `BACKEND\.env` (gitignored, stays local, never committed).
- [ ] From `BACKEND/`: `docker-compose up --build`
- [ ] This starts 4 containers: `redis` (local, not Upstash — compose overrides `REDIS_URL` so local runs never touch prod's Upstash instance or share task state with it), `api` (FastAPI on port 8000, `--reload` on), `celery_worker`, `celery_beat`.
- [ ] API reachable at `http://localhost:8000` on this machine — see section 4 for reaching it from a phone.
- [ ] Machine-specific tweaks (e.g. different port mapping) go in `docker-compose.override.yml` — already gitignored, Compose loads it automatically if present.

## 4. Mobile app: local backend vs. production backend

**Do not copy/duplicate the backend into `Kaargar_App`.** Reasons:
- `Kaargar_App` (`D:\Kaargar_App`) is its own separate git repo from the `Kaargar` backend/frontend repo — a copy would mean maintaining backend source in two repos forever, drifting apart every time one gets a fix the other doesn't.
- The backend doesn't need to live next to the mobile app on disk to be reachable — it's an HTTP API. What matters is the URL the app is pointed at, not the folder structure.

What actually gets you both things you asked for (local connection during dev, correct URL in the Play Store build) is environment configuration — already partly scaffolded in `D:\Kaargar_App\kaargar\.env`:

```
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_BASE_URL=https://kaargar.onrender.com/v1   ← currently always the deployed URL, even in dev
```

- [ ] **For local dev**: run the backend locally (either `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` directly, or `docker-compose up` per section 3), then in `D:\Kaargar_App\kaargar\.env` temporarily set:
  ```
  EXPO_PUBLIC_API_BASE_URL=http://<this-PC's-LAN-IP>:8000/v1
  ```
  Find the LAN IP with `ipconfig` (look for "IPv4 Address" under your active Wi-Fi adapter). A phone running Expo Go can't resolve `localhost` as your PC — it needs the actual LAN IP, and phone + PC must be on the same Wi-Fi network. (Android Studio's emulator specifically is the one exception — it can use `10.0.2.2` as an alias for the host machine instead of the real LAN IP.)
- [ ] **For the Play Store build**: set `EXPO_PUBLIC_API_BASE_URL` back to `https://kaargar.onrender.com/v1` before running `eas build`. Once `eas init`/`eas build:configure` has been run (not done yet — no EAS project ID in `app.json` yet), the more robust long-term fix is per-profile env blocks in `eas.json` (`build.development.env`, `build.production.env`, etc.) so this never has to be toggled by hand and can't accidentally ship a build pointed at localhost. Revisit this when EAS is actually set up.

## 5. Roadmap — not started

- [ ] Build OTP send/verify endpoints (additive, Supabase stays primary auth)
- [ ] Extend `dependencies.py`'s auth check to also accept a self-issued OTP-session JWT
- [ ] Wire FCM push notifications (blocked on Firebase service-account credentials)
- [ ] Wire promo campaign CRUD + delivery (admin endpoints, models/schemas already exist)
- [ ] Design feature/entity-based module boundaries (auth/, worker/, customer/, booking/, payment/, notification/, support/, admin/)
- [ ] Incrementally migrate routers into the new feature modules, one at a time, verifying the app still boots after each move
