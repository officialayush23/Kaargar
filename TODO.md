# Kaargar — Deployment Checklist

## Render (Backend) — Environment Variables to Set
Go to: Render dashboard → kaargar service → Environment

| Variable | Where to get |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (use `postgresql+asyncpg://...`) |
| `JWT_SECRET_KEY` | Generate: `openssl rand -hex 32` |
| `JWT_ALGORITHM` | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` |
| `REDIS_URL` | Upstash → Redis → Connect → copy `redis://...` URL |
| `RAZORPAY_KEY_ID` | Razorpay dashboard → API Keys |
| `RAZORPAY_KEY_SECRET` | Razorpay dashboard → API Keys |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay dashboard → Webhooks → create webhook for `https://kaargar.onrender.com/v1/payments/webhook` |
| `SMTP_HOST` | `smtp.resend.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USERNAME` | `resend` |
| `SMTP_PASSWORD` | Resend dashboard → API Keys → create key |
| `SMTP_FROM_EMAIL` | `noreply@kaargar.in` (verify domain at resend.com first) |
| `SMTP_FROM_NAME` | `Kaargar` |
| `GOOGLE_MAPS_API_KEY` | Google Cloud Console → APIs & Services → Credentials |
| `APP_ENV` | `production` |
| `FRONTEND_URL` | `https://kaargar1.vercel.app` |

## Vercel (Frontend) — Environment Variables to Set
Go to: Vercel dashboard → kaargar1 → Settings → Environment Variables

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `VITE_API_URL` | `https://kaargar.onrender.com/v1` |
| `VITE_RAZORPAY_KEY_ID` | Razorpay dashboard → API Keys (public key only) |

## What to do after setting env vars
1. Redeploy backend on Render (click "Manual Deploy" → "Deploy latest commit")
2. Redeploy frontend on Vercel (push a commit or click "Redeploy")
3. Test OTP: check Render logs for `[OTP DEBUG]` line — shows OTP even if SMTP fails
4. Test payment: use Razorpay test cards (`4111 1111 1111 1111`, any future date, any CVV)

## Razorpay Test Cards
- Success: `4111 1111 1111 1111` | Expiry: any future | CVV: any
- Failure: `4000 0000 0000 0002`
- UPI: `success@razorpay`

## Features Completed
- [x] Full auth flow (email OTP → JWT)
- [x] Instant + Discovery booking modes
- [x] Real-time job dispatch (PostGIS + Supabase Realtime)
- [x] Worker onboarding + verification
- [x] Services / Packages / Offers management (worker dashboard)
- [x] Package orders + usage tracking (user bookings)
- [x] OTP job start verification
- [x] Before/after photo uploads (Supabase Storage)
- [x] Razorpay payment + escrow (2h auto-release via APScheduler)
- [x] Refunds via Razorpay API
- [x] Commission calculation (instant 15%, discovery 10-15%)
- [x] Chat with phone masking
- [x] Reviews + sub-ratings
- [x] Admin panel (workers, jobs, support, dashboard)
- [x] Google Maps geocoding + address autocomplete
- [x] Dark/light theme toggle
- [x] Discovery page with packages + trending workers
- [x] Worker public profile (carousel, reviews, services, packages)
