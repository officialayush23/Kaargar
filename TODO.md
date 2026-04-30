# KAARGAR — Master TODO & Issue Tracker
> Last updated: 2026-04-30. Tasks 4–7 completed this session.

---

## 🔴 CRITICAL BUGS (breaks runtime)

- [x] **WorkerDashboard field name mismatch** — fixed: now uses `today_earnings`, `month_earnings`, `worker_payout`
- [x] **Missing `users.py` router** — created + registered in `main.py`
- [ ] **GeoAlchemy2 startup** — `geoalchemy2` must be installed in venv; if missing, entire backend crashes on import (causes all 404s)
- [ ] **Backend `.env`** — verify all env vars are set (SUPABASE_URL, JWT_SECRET_KEY, DATABASE_URL, etc.)
- [ ] **idx_wp_matching volatile fix** — run `004_fixes.sql` on Supabase SQL editor to drop+recreate the broken index. Also update `matching.py` dispatch query to add `auto_offline_until < NOW()` filter at runtime (see note in 004_fixes.sql).

---

## 🟠 MISSING BACKEND

- [x] `routers/users.py` — `GET /users/me`, `PATCH /users/me`, `PUT /users/me/preferences`
- [x] Register `users` router in `main.py`
- [x] `WorkerAnalyticsResponse` — enriched with `avg_rating`, `total_reviews`, `acceptance_rate` from WorkerProfile
- [x] `GET /admin/workers` (list, paginated)
- [x] `GET /admin/jobs` (list, paginated, filterable by status)
- [x] `GET /support/admin/tickets` (list by status)
- [x] `PATCH /support/admin/tickets/{id}/resolve`
- [ ] `POST /jobs/{id}/review` route doesn't exist yet (review after job completion) — ReviewPage.jsx uses `POST /reviews` instead, verify schema accepts sub-rating fields (quality_rating, punctuality_rating, communication_rating, value_rating)
- [ ] `GET /workers/{id}` — doesn't include worker's categories list
- [ ] `POST /workers/documents` — verify form-data endpoint exists and accepts `type` + `file` fields (used by WorkerOnboardPage step 3)

---

## 🟡 MISSING FRONTEND PAGES

- [x] Admin pages — AdminLogin, AdminLayout, AdminDashboard, AdminWorkers, AdminJobs, AdminSupport, AdminConfig
- [x] Admin routes registered in App.jsx (`/admin/*`)
- [x] `pages/job/ReviewPage.jsx` — star rating + sub-ratings + text after job completes (route: `/job/:jobId/review`)
- [x] `pages/discovery/BookDiscoveryPage.jsx` — date picker, time slot, location, confirm + pay (route: `/worker/:workerId/book`)
- [x] `pages/onboarding/WorkerOnboardPage.jsx` — 5-step wizard: bio → categories → documents → area → publish (route: `/onboard/worker`)

---

## 🟡 FRONTEND BUGS / UX FIXES

- [x] **WorkerLayout** — Kaargar logo (Playwrite NO) + avatar + notification bell + profile menu with theme toggle, sign out, navigation links
- [x] **HomePage ProfileMenu** — theme toggle added as list option (☀️/🌙)
- [x] **WorkerLayout ProfileMenu** — theme toggle added (Sun/Moon icons)
- [x] **Bottom navbar role-aware** — worker links only for role === 'worker'
- [x] **WorkerDashboard** — field names fixed + CSS vars used throughout, duplicate support card removed
- [x] **LoginPage Step 3** — after OTP verify: collect full_name (required), phone (optional), worker toggle
- [x] **LoginPage Step 4** — Pune area grid selection (20 areas); on submit navigates to `/onboard/worker` or `/`
- [x] **CategoryGrid** — replaced hardcoded `text-white/*` / `bg-white/*` / `border-white/*` with CSS vars (`--card-bg`, `--card-border`, `--text-secondary`) — works in light + dark
- [ ] **WorkerProfile.jsx** — photo upload uses old Cloudinary path; update to Supabase Storage `/upload/profile-photo`
- [x] **Route `/job/:id/review`** — added to App.jsx

---

## 🟢 DESIGN / POLISH

- [ ] **Light theme** — some pages have hardcoded dark classes (bg-black, text-white) that break in light mode. Need full CSS-var audit.
- [ ] **Worker bottom nav** — currently showing worker links for non-workers on some routes — verify `shouldHideNav` catches all edge cases
- [ ] **SearchingPage** — ripple animation should have amber/green glow matching mode
- [ ] **ActiveJobPage** — worker tracking map needs Mapbox integration
- [ ] **ChatPage** — messages auto-scroll to bottom on new message
- [ ] **Notification badge** on avatar in WorkerLayout header

---

## 🔵 INTEGRATION CHECKLIST

- [ ] **Mapbox** — geocoding wired in LocationModal + NewJobPage location input
- [ ] **Razorpay** — payment trigger wired from ActiveJobPage "Pay Now" button
- [ ] **Supabase Realtime** — verify 4 subscription channels all fire correctly:
  - `notif:{userId}` → NotificationDrawer
  - `job:{jobId}` → ActiveJobPage / SearchingPage
  - `chat:{chatId}` → ChatPage
  - `worker-requests:{workerId}` → IncomingJobModal
- [ ] **SMTP / Email** — OTP email sending actually works (Resend SMTP credentials set)
- [ ] **APScheduler tasks** — escrow_release + decay_scores tasks run without crashing on startup

---

## ✅ COMPLETED

- [x] GSAP LoadingScreen with Playwrite NO clip-path reveal
- [x] Full dark/light mode CSS variable system (`[data-theme="dark/light"]`)
- [x] Theme persistence via localStorage + pre-render in `main.jsx`
- [x] Bottom nav: role-aware (worker vs user links), hidden on `/job/*` routes
- [x] Liquid glass bottom nav pill with amber active indicator
- [x] GlassNavbar returns null (top bar removed — Blinkit style)
- [x] Worker dashboard online/offline toggle with Supabase Realtime
- [x] IncomingJobModal with 10s countdown + accept/decline
- [x] Worker support page
- [x] All backend routers: auth, categories, workers, jobs, upload, search, chat, payments, reviews, notifications, admin, support

---

## 📁 FILE INVENTORY

### Backend (✅ exists)
- `main.py`, `config.py`, `database.py`, `models.py`, `schemas.py`, `dependencies.py`
- `routers/`: auth, categories, workers, jobs, upload, search, chat, payments, reviews, notifications, admin, support
- `services/`: matching.py, notifications.py, storage.py
- `tasks/`: escrow_release.py, decay_scores.py

### Backend (❌ missing)
- `routers/users.py` ← **NEEDS CREATING**

### Frontend (✅ exists)
- All core pages: auth/Login, home/Home, job/New+Searching+Active, discovery/Discovery+WorkerProfile, bookings, chat, profile/Profile+Support
- Worker pages: Dashboard, Services, Media, Profile, Analytics, Support
- Components: GlassCard, GlassNavbar, GlassModal, Background, CategoryGrid, WorkerCard, MediaUpload, SearchBar, ModeToggle, LoadingScreen, ThemeToggle, NotificationDrawer, AddressModal, PuneMap
- Hooks: useCategories, useJobs, useWorker, useNotifications, useGeoLocation
- Stores: auth.js, app.js

### Frontend (❌ missing — was)
- All admin pages — ✅ DONE
- `pages/job/ReviewPage.jsx` — ✅ DONE
- `pages/discovery/BookDiscoveryPage.jsx` — ✅ DONE
- `pages/onboarding/WorkerOnboardPage.jsx` — ✅ DONE

### SQL Migrations (apply in order)
- `001_initial_schema.sql` — initial schema (has volatile bug at line 141, patched by 004)
- `002_fixes_and_performance.sql` — performance indexes, functions, views
- `003_fixes.sql` — budget_max column, min_rate/max_rate columns, refresh_tokens table
- `004_fixes.sql` — fixes volatile NOW() in idx_wp_matching + grants for refresh_tokens ← **RUN THIS**
