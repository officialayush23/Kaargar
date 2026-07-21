# Kaargar

Kaargar is a dual-mode, hyperlocal home-services marketplace for Pune, India. It works two ways at once: **Instant** mode matches users to a nearby available worker in real time (Uber/Rapido-style dispatch), and **Discovery** mode lets users browse worker profiles, packages, and offers and book on their own schedule.

## What it is

A full-stack app with a FastAPI backend and a React (Vite + JSX) frontend, backed by Supabase (Postgres + Auth + Storage + Realtime), Redis, and Razorpay for payments. Workers (electricians, cleaners, plumbers, etc.) get their own dashboard to go online, accept jobs, manage services/packages, and track earnings; users get booking, chat, payments, and reviews. There's also an admin panel for platform operations.

## Capabilities

**Booking & matching**
- Instant dispatch: a background matching engine searches for available workers in expanding radii (2km → 5km), ranks them by distance, rating, acceptance rate, completion rate, response time, and price, and pushes job offers with a 10-second accept/decline window via Supabase Realtime.
- Discovery mode: browse worker profiles, packages, trending workers, and book directly.
- Anti-gaming rules: repeated rejections put a worker briefly offline; cancellations after acceptance penalize a worker's ranking score (with gradual recovery per completed job).

**Worker side**
- Onboarding and document verification.
- Online/offline status toggle, live location updates, incoming job modal with countdown.
- Services, packages, and offers management.
- Before/after job photo uploads (Supabase Storage), OTP-based job-start verification.
- Earnings dashboard and analytics.
- Portfolio media (photos/videos) on a public profile.

**Payments**
- Razorpay checkout with escrow: funds are held and auto-released ~2 hours after job completion via a background scheduler, with support for refunds.
- Commission calculation: 15% flat for Instant jobs, a sliding 10–15% for Discovery jobs based on order value, plus GST.

**Trust & safety**
- In-app chat with automatic phone number, email, and social-handle masking (raw content is stored separately from what's shown to users).
- Reviews with sub-ratings after job completion.
- SOS/emergency job events.

**Other**
- Email OTP login, exchanged for a first-party JWT used by the API.
- Google Maps geocoding and address autocomplete, saved address book.
- Multi-language UI (English, Hindi, Marathi) via i18next.
- Dark/light theme toggle, glassmorphism design system.
- Admin panel: worker approval queue, jobs overview, support tickets, payouts, platform config.
- Background jobs run in-process via APScheduler (escrow release, worker score decay, package/slot scheduling) — no separate task queue.

## Tech stack

| Layer | Technology |
|---|---|
| Backend framework | FastAPI (async, SQLAlchemy 2.0 + asyncpg) |
| Database | PostgreSQL via Supabase (PostGIS for geo queries) |
| Auth | Supabase email OTP → first-party JWT |
| Storage | Supabase Storage (`profile_photos`, `worker_posts` buckets) |
| Real-time | Supabase Realtime (Postgres change subscriptions) |
| Background jobs | APScheduler (in-process) |
| Cache / rate limiting | Redis (Upstash) |
| Payments | Razorpay |
| Email | SMTP (Resend recommended) |
| Frontend framework | React 18 + Vite (JSX only, no TypeScript) |
| Frontend styling | Tailwind CSS, glassmorphism component library |
| Frontend state | Zustand, TanStack Query |
| Maps | Google Maps (geocoding) + Mapbox GL / react-map-gl |
| i18n | i18next / react-i18next |

## Repository layout

```
Kaargar/
├── BACKEND/
│   ├── main.py                # FastAPI app entrypoint, router mounting, lifespan/scheduler startup
│   ├── config.py               # Settings (env vars)
│   ├── database.py
│   ├── models.py               # All SQLAlchemy models
│   ├── schemas.py               # All Pydantic schemas
│   ├── dependencies.py         # Auth/role dependencies
│   ├── routers/                 # auth, categories, workers, jobs, upload, search, chat,
│   │                            # payments, reviews, notifications, support, admin, users,
│   │                            # geocode, addresses
│   ├── services/                # matching (dispatch engine), storage, notifications, scheduling, translation
│   ├── tasks/                   # escrow_release, decay_scores, scheduling (APScheduler jobs)
│   └── templates/email/         # OTP email template
├── FRONTEND/
│   ├── src/
│   │   ├── pages/                # home, job (new/searching/active/detail/review), discovery,
│   │   │                          # bookings, chat, profile, support, onboarding, worker/*, admin/*
│   │   ├── components/
│   │   │   ├── glass/             # Glassmorphism UI primitives (card, button, modal, navbar...)
│   │   │   ├── kaargar/           # Domain components (ModeToggle, CategoryGrid, WorkerCard,
│   │   │   │                      #   JobStatusTimeline, MediaUpload, PuneMap, AddressBook...)
│   │   │   ├── ui/                 # shadcn-style base components
│   │   │   └── layout/             # AppLayout, WorkerLayout
│   │   ├── hooks/                  # useCategories, useJobs, useWorker, useNotifications, useGeocoding...
│   │   ├── stores/                 # auth.js, app.js (Zustand)
│   │   ├── lib/                     # api.js, supabase.js, theme.js, utils.js
│   │   └── i18n/                    # en / hi / mr translations
│   └── vite.config.js
├── 001–009_*.sql                 # Database migrations (schema, fixes, packages, scheduling, addresses, i18n)
├── seed_data.sql / seed_platform_config.sql
└── KAARGAR_SYSTEM_DESIGN_v2.md, CLAUDE.md, IMPLEMENTATION_AUDIT.md, TODO.md  # design & project docs
```

## Installation

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- A Supabase project (Postgres with PostGIS, Auth, Storage, Realtime enabled)
- Redis instance (Upstash free tier works)
- Razorpay account (test mode keys are fine for local dev)
- SMTP credentials (Resend recommended) for OTP emails
- Google Maps API key (Geocoding, Places, Maps JavaScript APIs enabled)

### Database

The schema is provided as a set of numbered SQL migrations at the repo root (`001_initial_schema.sql` through `009_translations_and_language.sql`), plus `seed_data.sql` and `seed_platform_config.sql`. Run these in order against your Supabase Postgres instance (via the SQL editor or `psql`) before starting the backend.

### Backend setup

```bash
cd BACKEND
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # fill in Supabase, JWT, Redis, Razorpay, SMTP, Maps keys
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API is available at `http://localhost:8000`, interactive docs at `/docs`, health check at `/health`. All routes are mounted under `/v1`.

### Frontend setup

```bash
cd FRONTEND
npm install
cp .env.example .env              # set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL, VITE_RAZORPAY_KEY_ID
npm run dev
```

The app runs at `http://localhost:5173` and talks to the backend via `VITE_API_URL`.

### Environment variables

Both `BACKEND/.env.example` and `FRONTEND/.env.example` list every variable required. At minimum you'll need:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` — Supabase project + Postgres connection
- `APP_SECRET_KEY` (backend `.env` key for the JWT secret; see `config.py`), `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`
- `REDIS_URL` — rate limiting and dispatch locks
- `RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` — payments (frontend needs the public `VITE_RAZORPAY_KEY_ID` only)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` — OTP delivery
- `GOOGLE_MAPS_API_KEY` — geocoding and address autocomplete
- `FRONTEND_URL` / `VITE_API_URL` — cross-service URLs for CORS and API calls

> Note: variable names in `config.py` don't always match the names documented elsewhere in the repo (e.g. the JWT secret is read from `APP_SECRET_KEY`, environment mode from `ENVIRONMENT`). Use `BACKEND/.env.example` as the source of truth.

### Deployment

The project is set up to deploy the backend to Render and the frontend to Vercel (`FRONTEND/vercel.json` included). `TODO.md` has a full checklist of environment variables to set on each platform and test credentials for Razorpay's sandbox.

### Testing payments locally

Razorpay test mode is preconfigured. Use test card `4111 1111 1111 1111` (any future expiry, any CVV), or UPI IDs `success@razorpay` / `failure@razorpay` to simulate outcomes — no real money moves.

## Project status

Core flows are implemented and working end to end: auth, both booking modes, real-time dispatch, worker onboarding, services/packages/offers, escrow payments with refunds, chat with phone masking, reviews, and an admin panel. See `IMPLEMENTATION_AUDIT.md` for a detailed diff against the original design docs, including a few known field-name mismatches between frontend and backend that are still being ironed out, and `TODO.md` for the deployment checklist.

## License

See [LICENSE](./LICENSE).
