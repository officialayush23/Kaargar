# ⚡ KAARGAR — Dual-Mode Local Services Platform
## System Design Specification v2.0 — DESIGN LOCK

> **App Name:** Kaargar  
> **Launch City:** Pune, Maharashtra  
> **Status:** Design Locked ✅ — Ready to Build  
> **Phase 1 Stack:** Supabase + FastAPI + React (Web) + shadcn/ui  
> **Phase 2 Stack:** AWS RDS + EC2 + S3 (migration, not rewrite)  

---

## 📋 TABLE OF CONTENTS

1. [Decision Log (All Decisions Locked)](#1-decision-log)
2. [Commission & Monetization](#2-commission--monetization)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack — Phase 1 vs Phase 2](#4-tech-stack)
5. [Supabase Setup & Configuration](#5-supabase-setup--configuration)
6. [Notification System (SMTP + In-App)](#6-notification-system)
7. [Database Schema — Complete (30 Tables)](#7-database-schema)
8. [Matching Engine](#8-matching-engine)
9. [Search & Recommendations](#9-search--recommendations)
10. [Chat & Phone Masking](#10-chat--phone-masking)
11. [Payments & Escrow (Razorpay, Mandatory)](#11-payments--escrow)
12. [UI/UX Design System (shadcn + Custom)](#12-uiux-design-system)
13. [User App — Screen-by-Screen](#13-user-app--screen-by-screen)
14. [Worker App — Screen-by-Screen](#14-worker-app--screen-by-screen)
15. [Admin Panel](#15-admin-panel)
16. [API Design](#16-api-design)
17. [Infrastructure — Phase 1 (Supabase)](#17-infrastructure--phase-1)
18. [Migration Plan — Phase 2 (AWS)](#18-migration-plan--phase-2-aws)
19. [Build Plan (Day-by-Day)](#19-build-plan)

---

## 1. DECISION LOG

All decisions below are **locked**. No reopening without documented reason.

| # | Decision | Chosen | Rationale |
|---|---|---|---|
| 1 | App Name | **Kaargar** | Locked |
| 2 | Launch market | **Pune only** | Focused supply density |
| 3 | Instant commission | **15% flat** | Simple, high-margin |
| 4 | Discovery commission | **10–15% sliding scale** | Fair for big-ticket jobs |
| 5 | Payment method | **Mandatory Razorpay** | No cash handling complexity |
| 6 | Auth method | **Email OTP (SMTP) Phase 1** | No SMS cost; phone stored for identity |
| 7 | Notifications | **SMTP email + in-app (Supabase Realtime)** | Zero cost Phase 1 |
| 8 | SMS capability | **Abstracted NotificationService** | Swap to MSG91/Twilio with config change |
| 9 | Frontend | **React Web App (not PWA, not RN)** | Fastest iteration; RN comes Phase 3 |
| 10 | UI library | **shadcn/ui + Tailwind + custom CSS** | Accessible, composable, not generic |
| 11 | Phase 1 infra | **Supabase** | Zero DevOps, pure Postgres, migratable |
| 12 | Phase 2 infra | **AWS RDS + EC2 + S3** | Scale milestone: 500 active workers |
| 13 | Maps | **Mapbox Phase 1 → Google Maps Phase 2** | Free 50K/month |
| 14 | Media storage | **Cloudinary (free 25GB) Phase 1** | Avoids Supabase Storage 1GB cap |
| 15 | Search | **Postgres FTS + pg_trgm** | On existing DB, zero extra infra |
| 16 | Intent detection | **Rule-based keyword classifier** | Free, fast, predictable |
| 17 | Recommendations | **SQL aggregation over search_history** | No ML, pure SQL |
| 18 | Real-time | **Supabase Realtime (Phase 1)** → WebSocket FastAPI (Phase 2) | Built-in, free |
| 19 | Background jobs | **APScheduler in FastAPI process** | No Celery/Redis for MVP |
| 20 | React Native | **Phase 3 (after web is stable)** | Ship web first |

---

## 2. COMMISSION & MONETIZATION

### 2.1 Instant Mode — 15% Flat

```
User pays:        ₹500
Platform fee:     ₹75  (15%)
GST on fee:       ₹13.50 (18% GST on ₹75)
Worker payout:    ₹411.50

Minimum job price: ₹100 (floor enforced per category)
```

### 2.2 Discovery Mode — Sliding Scale (10–15%)

```python
def calculate_discovery_commission(amount: float) -> float:
    """
    Linear interpolation from 10% to 15% based on job amount.
    ₹0       → 10%
    ₹50,000+ → 15%
    """
    MIN_RATE = 0.10
    MAX_RATE = 0.15
    SCALE_UP_TO = 50_000  # amount at which max rate kicks in

    if amount <= 0:
        return MIN_RATE
    
    # Linear interpolation
    rate = MIN_RATE + (MAX_RATE - MIN_RATE) * min(amount / SCALE_UP_TO, 1.0)
    return round(rate, 4)

# Examples:
# ₹1,000  → 10.1%  → platform takes ₹101
# ₹5,000  → 10.5%  → platform takes ₹525
# ₹10,000 → 11.0%  → platform takes ₹1,100
# ₹25,000 → 12.5%  → platform takes ₹3,125
# ₹50,000 → 15.0%  → platform takes ₹7,500
```

### 2.3 Commission Table in DB

```sql
-- Stored in platform_config:
-- discovery_commission_min_rate: 0.10
-- discovery_commission_max_rate: 0.15
-- discovery_commission_scale_amount: 50000
-- instant_commission_rate: 0.15
-- gst_rate: 0.18
-- escrow_release_hours: 2
-- cancellation_penalty_user: 50
-- cancellation_penalty_worker: 100
```

---

## 3. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENTS (React Web)                         │
│                                                                  │
│  kaargar.in         kaargar.in/worker    kaargar.in/admin        │
│  (User App)         (Worker Dashboard)   (Admin Panel)           │
│                                                                  │
│  All served via: Vercel (free tier, instant deploys)             │
└─────────────────┬────────────────────────────────────────────────┘
                  │ HTTPS / REST
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│              FastAPI Backend                                      │
│              (Railway.app free tier / Render.com free)           │
│                                                                  │
│  Routers: auth | users | workers | jobs | search | chat          │
│           payments | reviews | admin | notifications             │
│                                                                  │
│  Services: MatchingEngine | NotificationService | PaymentService │
│            SearchService | RecommendationService                  │
│                                                                  │
│  Background: APScheduler                                          │
│  - dispatch_jobs (continuous)                                     │
│  - release_escrow (every 15min)                                   │
│  - decay_cron (daily)                                             │
│  - analytics_rollup (hourly)                                      │
└─────────────┬────────────────────────────────────────────────────┘
              │ direct Postgres connection (not supabase-js)
              │ + Supabase Realtime SDK for pub/sub
              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Phase 1)                             │
│                                                                  │
│  PostgreSQL 15 + PostGIS + pg_trgm                               │
│  ├── All 30 application tables                                    │
│  ├── Supabase Auth (email OTP via SMTP)                          │
│  ├── Supabase Realtime (in-app notifications, job updates)        │
│  └── Supabase Storage → replaced by Cloudinary                   │
│                                                                  │
│  Free tier: 500MB DB | 50K MAU | 2M realtime messages/month     │
└─────────────────────────────────────────────────────────────────┘

External services (all free tier):
  Cloudinary   → Worker photos, videos, reels, job photos (25GB free)
  Razorpay     → Payments (no monthly fee, 2% per txn)
  Mapbox       → Maps (50K requests/month free)
  SMTP         → Gmail SMTP / Resend.com free tier (100 emails/day)
  Vercel       → Frontend hosting (free)
  Railway/Render → Backend hosting (free tier)
```

---

## 4. TECH STACK

### Backend
| Layer | Tech | Version | Notes |
|---|---|---|---|
| Language | Python | 3.12 | |
| Framework | FastAPI | 0.115+ | Async, auto-docs |
| ORM | SQLAlchemy | 2.0 async | Direct Postgres connection |
| Migrations | Alembic | latest | Run against Supabase DB |
| Validation | Pydantic | v2 | Built into FastAPI |
| Auth | python-jose | latest | JWT generation/validation |
| Supabase client | supabase-py | latest | Only for Realtime pub/sub |
| Geo | GeoAlchemy2 | latest | PostGIS types |
| Scheduler | APScheduler | 3.x | In-process background tasks |
| Email | aiosmtplib | latest | Async SMTP |
| HTTP client | httpx | latest | Async HTTP (Razorpay, Cloudinary) |

### Frontend
| Layer | Tech | Notes |
|---|---|---|
| Framework | React 18 + Vite | |
| Language | TypeScript | Strict mode |
| UI Library | **shadcn/ui** | Primary component system |
| Styling | Tailwind CSS v3 | shadcn-compatible config |
| State | Zustand | Lightweight, no boilerplate |
| Routing | React Router v6 | Client-side routing |
| Data fetching | TanStack Query v5 | Server state, caching |
| Forms | React Hook Form + Zod | shadcn Form integration |
| Maps | Mapbox GL JS | Worker locations, job tracking |
| Payments | Razorpay JS SDK | Official |
| Real-time | Supabase Realtime JS | In-app notifications |
| Icons | Lucide React | shadcn default |
| Charts | Recharts | Worker analytics (shadcn compatible) |
| Toast | shadcn/Sonner | Notification toasts |
| Tables | shadcn/DataTable | Admin, worker job lists |
| Dialogs | shadcn/Dialog | Job request modal, confirmations |
| Notifications | shadcn/Sheet + custom | In-app notification drawer |

### shadcn Components Used (comprehensive list)
```
Core layout: Card, Separator, ScrollArea, Tabs, Sheet, Drawer
Forms: Form, Input, Textarea, Select, Switch, Checkbox, RadioGroup, Slider
Feedback: Toast (Sonner), Alert, Badge, Progress, Skeleton
Navigation: NavigationMenu, DropdownMenu, ContextMenu, Command
Overlay: Dialog, AlertDialog, Sheet, Tooltip, Popover, HoverCard
Data: Table, DataTable (with TanStack Table), Pagination
Display: Avatar, AspectRatio, Carousel
Charts: via Recharts wrapper components
Special: Calendar (for scheduling), OTPInput (custom), MapCard (custom)
```

---

## 5. SUPABASE SETUP & CONFIGURATION

### 5.1 Connection Strategy
```python
# FastAPI connects directly to Postgres — NOT via supabase-js
# This means: zero vendor lock-in on business logic

DATABASE_URL = "postgresql+asyncpg://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"

# Only use supabase-py for:
# 1. Realtime subscriptions (pub/sub for in-app notifications)
# 2. Auth management (admin: create users, invalidate sessions)

from supabase import create_client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
# Never expose service_role key to frontend
```

### 5.2 Supabase Auth — Email OTP

```python
# Supabase Auth handles:
# - Email OTP sending (via SMTP you configure in Supabase dashboard)
# - Session tokens
# - We wrap this in our own auth service for future SMS migration

class AuthService:
    async def send_otp(self, email: str) -> None:
        """
        Phase 1: Send OTP via Supabase Auth (email/SMTP)
        Phase 2: Replace with MSG91/Twilio phone OTP
        """
        # Supabase handles the OTP email automatically
        await supabase.auth.sign_in_with_otp({"email": email})
    
    async def verify_otp(self, email: str, token: str) -> dict:
        result = await supabase.auth.verify_otp({
            "email": email,
            "token": token,
            "type": "email"
        })
        # Extract user, create our own JWT with role claims
        return self._create_kaargar_token(result.user)
```

### 5.3 SMTP Configuration (in Supabase Dashboard)
```
Dashboard → Authentication → Email Templates → SMTP Settings:
  Host: smtp.gmail.com (or smtp.resend.com)
  Port: 587
  Username: noreply@kaargar.in
  Password: [App password]
  
Custom email templates:
  - OTP email: "Your Kaargar verification code: {{.Token}}"
  - Welcome email: custom HTML template
```

### 5.4 Supabase Realtime — In-App Notifications
```typescript
// Frontend: subscribe to user's notifications
import { supabase } from '@/lib/supabase'

// IMPORTANT: Only anon key used on frontend (never service_role)
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

supabase
  .channel(`notifications:${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${userId}`
  }, (payload) => {
    // Show shadcn toast
    toast(payload.new.title, { description: payload.new.body })
    // Add to notification drawer
    addNotification(payload.new)
  })
  .subscribe()

// Also used for real-time job status updates (worker location, status changes)
supabase
  .channel(`job:${jobId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public', 
    table: 'jobs',
    filter: `id=eq.${jobId}`
  }, handleJobUpdate)
  .subscribe()
```

### 5.5 RLS Policies (Critical Security)
```sql
-- Enable RLS on ALL tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
-- ... all 30 tables

-- Example policies:
-- Users can only read/update their own row
CREATE POLICY "users_self" ON users
  FOR ALL USING (auth.uid() = id);

-- Notifications: users see only their own
CREATE POLICY "notifications_owner" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- Jobs: user sees their jobs, worker sees assigned jobs
CREATE POLICY "jobs_user" ON jobs
  FOR SELECT USING (
    auth.uid() = user_id OR 
    auth.uid() = (SELECT user_id FROM worker_profiles WHERE id = worker_id)
  );

-- Messages: only chat participants
CREATE POLICY "messages_participants" ON messages
  FOR ALL USING (
    auth.uid() IN (
      SELECT user_id FROM chats WHERE id = chat_id
      UNION
      SELECT wp.user_id FROM chats c 
        JOIN worker_profiles wp ON wp.id = c.worker_id 
        WHERE c.id = chat_id
    )
  );

-- Worker locations: only the worker can update their location
CREATE POLICY "locations_owner_write" ON worker_locations
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM worker_profiles WHERE id = worker_id)
  );

-- Admin bypass policy (add to tables admin needs full access)
CREATE POLICY "admin_all" ON jobs
  FOR ALL USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
-- IMPORTANT: Use app_metadata NOT user_metadata (user_metadata is user-editable)
```

---

## 6. NOTIFICATION SYSTEM

### 6.1 Architecture (Abstracted for Future SMS)

```python
# notifications/service.py

from abc import ABC, abstractmethod
from enum import Enum

class NotificationChannel(Enum):
    EMAIL = "email"
    IN_APP = "in_app"
    SMS = "sms"  # not active Phase 1

class NotificationTemplate(Enum):
    OTP = "otp"
    JOB_ASSIGNED = "job_assigned"
    JOB_REQUEST = "job_request"
    JOB_COMPLETED = "job_completed"
    JOB_CANCELLED = "job_cancelled"
    PAYMENT_RECEIVED = "payment_received"
    PAYOUT_PROCESSED = "payout_processed"
    VERIFICATION_APPROVED = "verification_approved"
    VERIFICATION_REJECTED = "verification_rejected"
    REVIEW_RECEIVED = "review_received"
    ACCOUNT_WELCOME = "account_welcome"

class NotificationService:
    """
    Unified notification service.
    Phase 1: Email (SMTP) + In-app (Supabase Realtime)
    Phase 2: Add SMS (MSG91/Twilio) by adding SMSProvider
    """
    
    def __init__(self, email_provider: EmailProvider, realtime: RealtimeProvider):
        self.email = email_provider
        self.realtime = realtime
        # Future: self.sms = SMSProvider()
    
    async def notify(
        self,
        user_id: str,
        template: NotificationTemplate,
        data: dict,
        channels: list[NotificationChannel] = None
    ):
        if channels is None:
            channels = [NotificationChannel.EMAIL, NotificationChannel.IN_APP]
        
        # Always save to DB first (for notification drawer)
        notification = await self._save_notification(user_id, template, data)
        
        if NotificationChannel.IN_APP in channels:
            # Supabase Realtime automatically broadcasts the INSERT
            # No extra code needed — the frontend subscription picks it up
            pass
        
        if NotificationChannel.EMAIL in channels:
            user = await get_user(user_id)
            if user.email:
                await self.email.send(
                    to=user.email,
                    template=template,
                    data=data
                )
        
        # Phase 2: SMS
        # if NotificationChannel.SMS in channels and user.phone_verified:
        #     await self.sms.send(user.phone, template, data)
```

### 6.2 SMTP Email Provider

```python
# notifications/email.py

import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from jinja2 import Environment, FileSystemLoader

class SMTPEmailProvider:
    """
    Phase 1: Gmail SMTP or Resend.com
    Switch to Resend (10K free/month) for better deliverability.
    
    To migrate to MSG91:
    - Create MSG91EmailProvider implementing same interface
    - Swap in DI container
    - No other code changes needed
    """
    
    def __init__(self, config: SMTPConfig):
        self.config = config
        self.jinja = Environment(loader=FileSystemLoader('templates/email'))
    
    async def send(self, to: str, template: NotificationTemplate, data: dict):
        html = self.jinja.get_template(f'{template.value}.html').render(**data)
        
        msg = MIMEMultipart('alternative')
        msg['Subject'] = EMAIL_SUBJECTS[template].format(**data)
        msg['From'] = 'Kaargar <noreply@kaargar.in>'
        msg['To'] = to
        msg.attach(MIMEText(html, 'html'))
        
        async with aiosmtplib.SMTP(
            hostname=self.config.host,
            port=self.config.port,
            use_tls=True
        ) as smtp:
            await smtp.login(self.config.username, self.config.password)
            await smtp.send_message(msg)
```

### 6.3 In-App Notification UI (shadcn)

```tsx
// components/NotificationDrawer.tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Bell } from 'lucide-react'

export function NotificationDrawer() {
  const { notifications, unreadCount, markAllRead } = useNotifications()
  
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            Notifications
            <Button variant="ghost" size="sm" onClick={markAllRead}>
              Mark all read
            </Button>
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          {notifications.map(n => (
            <NotificationItem key={n.id} notification={n} />
          ))}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
```

### 6.4 Email Templates Required

```
templates/email/
├── base.html              (shared header/footer with Kaargar branding)
├── otp.html               "Your Kaargar code: {{otp}}"
├── welcome.html           "Welcome to Kaargar!"
├── job_assigned.html      "Your worker is on the way"
├── job_request.html       (worker) "New job request"
├── job_completed.html     "Job completed — Rate your experience"
├── job_cancelled.html     "Your job was cancelled"
├── payment_received.html  "Payment of ₹{{amount}} received"
├── payout_processed.html  (worker) "₹{{amount}} transferred to your account"
├── verification_approved.html  (worker) "You're approved! Start earning."
└── verification_rejected.html  (worker) "Document re-upload required"
```

---

## 7. DATABASE SCHEMA

### PostgreSQL Extensions
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
```

---

### 7.1 USERS

```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Auth: linked to Supabase Auth user (same UUID)
  email           VARCHAR(254) NOT NULL UNIQUE,
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  phone           VARCHAR(15),                          -- stored but not used for auth Phase 1
  phone_verified  BOOLEAN NOT NULL DEFAULT false,
  full_name       VARCHAR(100),
  avatar_url      TEXT,                                 -- Cloudinary URL
  role            VARCHAR(20) NOT NULL DEFAULT 'user',  -- 'user' | 'worker' | 'admin'
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_banned       BOOLEAN NOT NULL DEFAULT false,
  ban_reason      TEXT,
  referral_code   VARCHAR(12) UNIQUE,
  referred_by     UUID REFERENCES users(id),
  last_seen_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supabase: user id = auth.users.id (link them)
-- role stored in app_metadata JWT claim for RLS policies

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_name_trgm ON users USING GIN(full_name gin_trgm_ops);
```

---

### 7.2 OTP SESSIONS (Custom, for future phone OTP)

```sql
CREATE TABLE otp_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier   VARCHAR(254) NOT NULL,      -- email or phone
  type         VARCHAR(10) NOT NULL,       -- 'email' | 'phone'
  otp_hash     VARCHAR(64) NOT NULL,       -- bcrypt hash
  purpose      VARCHAR(20) NOT NULL,       -- 'login' | 'verify_phone'
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  is_used      BOOLEAN NOT NULL DEFAULT false,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Phase 1: Supabase Auth handles email OTP, this table used for phone OTP Phase 2
CREATE INDEX idx_otp_identifier ON otp_sessions(identifier, expires_at);
```

---

### 7.3 CATEGORIES

```sql
CREATE TABLE categories (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  slug          VARCHAR(100) NOT NULL UNIQUE,
  description   TEXT,
  icon_name     VARCHAR(50),        -- Lucide icon name
  icon_emoji    VARCHAR(10),        -- fallback emoji (internal use only, not shown in UI)
  color_hex     VARCHAR(7),         -- category accent color e.g. '#F59E0B'
  mode          VARCHAR(20) NOT NULL DEFAULT 'both',
  -- 'instant' | 'discovery' | 'both'
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  parent_id     UUID REFERENCES categories(id),   -- subcategories
  min_price     DECIMAL(10,2) NOT NULL DEFAULT 50, -- price floor (anti-gaming)
  -- Search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES users(id)
);

CREATE INDEX idx_categories_slug ON categories(slug);
CREATE INDEX idx_categories_mode ON categories(mode, sort_order) WHERE is_active = true;
CREATE INDEX idx_categories_search ON categories USING GIN(search_vector);

-- ============================================================
-- SEED DATA — Run on first deploy
-- ============================================================

-- INSTANT MODE CATEGORIES (Pune-specific priority order)
INSERT INTO categories (name, slug, icon_name, color_hex, mode, sort_order, min_price) VALUES
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
  ('Furniture Assembly', 'furniture-assembly','Armchair',      '#B45309', 'instant',  14,  150);

-- DISCOVERY MODE CATEGORIES
INSERT INTO categories (name, slug, icon_name, color_hex, mode, sort_order, min_price) VALUES
  ('Photographer',       'photographer',      'Camera',        '#EC4899', 'discovery',  1, 500),
  ('Videographer',       'videographer',      'Video',         '#EF4444', 'discovery',  2, 800),
  ('Musician / Band',    'musician',          'Music',         '#8B5CF6', 'discovery',  3, 500),
  ('DJ',                 'dj',                'Disc3',         '#7C3AED', 'discovery',  4, 2000),
  ('Interior Designer',  'interior-designer', 'Home',          '#F59E0B', 'discovery',  5, 2000),
  ('Wedding Planner',    'wedding-planner',   'Heart',         '#EC4899', 'discovery',  6, 5000),
  ('Event Decorator',    'event-decorator',   'Sparkles',      '#F97316', 'discovery',  7, 1500),
  ('Personal Trainer',   'personal-trainer',  'Dumbbell',      '#10B981', 'discovery',  8, 500),
  ('Yoga Instructor',    'yoga-instructor',   'Leaf',          '#34D399', 'discovery',  9, 400),
  ('Private Tutor',      'tutor',             'GraduationCap', '#3B82F6', 'discovery', 10, 300),
  ('Chef / Cook',        'chef',              'ChefHat',       '#F59E0B', 'discovery', 11, 800),
  ('Beautician',         'beautician',        'Scissors',      '#EC4899', 'discovery', 12, 300),
  ('Makeup Artist',      'makeup-artist',     'Wand',          '#A855F7', 'discovery', 13, 500),
  ('Mehndi Artist',      'mehndi',            'Palmtree',      '#EA580C', 'discovery', 14, 300),
  ('Catering Service',   'catering',          'UtensilsCrossed','#EAB308','discovery', 15, 2000),
  ('Security Guard',     'security',          'Shield',        '#1E40AF', 'both',      16, 500);
```

---

### 7.4 TAGS

```sql
CREATE TABLE tags (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  category_id UUID REFERENCES categories(id),
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tags_category ON tags(category_id);
CREATE INDEX idx_tags_name_trgm ON tags USING GIN(name gin_trgm_ops);
CREATE INDEX idx_tags_usage ON tags(usage_count DESC);
```

---

### 7.5 WORKER PROFILES

```sql
CREATE TABLE worker_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  bio                   TEXT,
  experience_years      INTEGER DEFAULT 0,
  pune_area             VARCHAR(100),       -- Specific area in Pune (Hinjewadi, Kothrud, etc.)
  
  -- Status
  status                VARCHAR(20) NOT NULL DEFAULT 'offline',
  -- 'online' | 'offline' | 'busy'
  verification_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'in_review' | 'approved' | 'rejected' | 'suspended'
  rejection_reason      TEXT,
  verified_at           TIMESTAMPTZ,
  
  -- Availability flags
  is_instant_available  BOOLEAN NOT NULL DEFAULT false,   -- opt-in for instant mode
  is_discovery_available BOOLEAN NOT NULL DEFAULT true,   -- always available for discovery
  service_radius_km     INTEGER NOT NULL DEFAULT 5,       -- max travel radius
  
  -- Performance metrics (updated via triggers/cron, not on every write)
  avg_rating            DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  rating_count          INTEGER NOT NULL DEFAULT 0,
  total_jobs_completed  INTEGER NOT NULL DEFAULT 0,
  total_jobs_accepted   INTEGER NOT NULL DEFAULT 0,
  total_jobs_requested  INTEGER NOT NULL DEFAULT 0,
  acceptance_rate       DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  completion_rate       DECIMAL(5,4) NOT NULL DEFAULT 1.0000,
  avg_response_time_sec INTEGER NOT NULL DEFAULT 0,
  
  -- Anti-gaming
  cancellation_score    DECIMAL(5,4) NOT NULL DEFAULT 1.0000, -- 1.0=good, 0=bad
  consecutive_rejects   INTEGER NOT NULL DEFAULT 0,
  auto_offline_until    TIMESTAMPTZ,
  
  -- Financials
  total_earnings        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  pending_payout        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  
  -- Payout details
  payout_upi_id         VARCHAR(100),
  payout_bank_account   VARCHAR(20),
  payout_ifsc           VARCHAR(11),
  payout_account_name   VARCHAR(100),
  payout_verified       BOOLEAN NOT NULL DEFAULT false,
  
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_profiles_user ON worker_profiles(user_id);
CREATE INDEX idx_worker_profiles_status ON worker_profiles(status, verification_status);
-- Hot path index: online + approved + instant-available workers
CREATE INDEX idx_worker_matching ON worker_profiles(
  avg_rating DESC, 
  total_jobs_completed DESC, 
  acceptance_rate DESC
)
WHERE status = 'online' 
  AND verification_status = 'approved' 
  AND is_instant_available = true
  AND (auto_offline_until IS NULL OR auto_offline_until < NOW());
```

---

### 7.6 WORKER DOCUMENTS

```sql
CREATE TABLE worker_documents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id        UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  type             VARCHAR(30) NOT NULL,
  -- 'aadhaar_front' | 'aadhaar_back' | 'pan' | 'selfie' 
  -- | 'certificate' | 'police_clearance' | 'other'
  cloudinary_url   TEXT NOT NULL,
  cloudinary_id    TEXT NOT NULL,           -- for deletion
  file_size_kb     INTEGER,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'rejected'
  rejection_reason TEXT,
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_docs_worker ON worker_documents(worker_id);
CREATE INDEX idx_worker_docs_pending ON worker_documents(status, created_at) 
  WHERE status = 'pending';
```

---

### 7.7 WORKER CATEGORIES (M2M)

```sql
CREATE TABLE worker_categories (
  worker_id    UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  category_id  UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (worker_id, category_id)
);

CREATE INDEX idx_worker_categories_cat ON worker_categories(category_id, worker_id);
```

---

### 7.8 SERVICES

```sql
CREATE TABLE services (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id        UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  category_id      UUID NOT NULL REFERENCES categories(id),
  title            VARCHAR(150) NOT NULL,
  description      TEXT,
  price            DECIMAL(10,2) NOT NULL,
  price_type       VARCHAR(20) NOT NULL DEFAULT 'fixed',
  -- 'fixed' | 'hourly' | 'negotiable' | 'starting_from'
  duration_min     INTEGER,                    -- estimated duration in minutes
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

CREATE INDEX idx_services_worker ON services(worker_id) WHERE is_active = true;
CREATE INDEX idx_services_category ON services(category_id, avg_rating DESC) WHERE is_active = true;
CREATE INDEX idx_services_search ON services USING GIN(search_vector);
CREATE INDEX idx_services_title_trgm ON services USING GIN(title gin_trgm_ops);
```

---

### 7.9 SERVICE TAGS (M2M)

```sql
CREATE TABLE service_tags (
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (service_id, tag_id)
);
CREATE INDEX idx_service_tags_tag ON service_tags(tag_id, service_id);
```

---

### 7.10 SERVICE MEDIA

```sql
CREATE TABLE service_media (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id      UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  service_id     UUID REFERENCES services(id) ON DELETE SET NULL,
  -- null = general portfolio (shows on worker profile, not specific service)
  type           VARCHAR(10) NOT NULL,
  -- 'image' | 'video' | 'reel'
  cloudinary_url TEXT NOT NULL,
  cloudinary_id  TEXT NOT NULL,              -- for deletion
  thumbnail_url  TEXT,                       -- for video/reel
  caption        TEXT,
  duration_sec   INTEGER,                    -- video/reel duration
  file_size_mb   DECIMAL(8,2),
  width          INTEGER,
  height         INTEGER,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  is_featured    BOOLEAN NOT NULL DEFAULT false, -- shown on profile hero
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_media_worker ON service_media(worker_id, sort_order);
CREATE INDEX idx_service_media_service ON service_media(service_id, sort_order);
CREATE INDEX idx_service_media_featured ON service_media(worker_id, is_featured) WHERE is_featured = true;
```

---

### 7.11 PACKAGES

```sql
CREATE TABLE packages (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id        UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
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

CREATE TABLE package_services (
  package_id  UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  quantity    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (package_id, service_id)
);

CREATE INDEX idx_packages_worker ON packages(worker_id) WHERE is_active = true;
```

---

### 7.12 OFFERS

```sql
CREATE TABLE offers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id       UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  service_id      UUID REFERENCES services(id),   -- null = all services
  package_id      UUID REFERENCES packages(id),
  title           VARCHAR(150) NOT NULL,
  description     TEXT,
  discount_type   VARCHAR(20) NOT NULL,            -- 'percent' | 'flat'
  discount_value  DECIMAL(10,2) NOT NULL,
  min_order_value DECIMAL(10,2),
  promo_code      VARCHAR(30) UNIQUE,
  valid_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until     TIMESTAMPTZ NOT NULL,
  usage_limit     INTEGER,                         -- null = unlimited
  usage_count     INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_offers_worker_active ON offers(worker_id, valid_until) 
  WHERE is_active = true AND valid_until > NOW();
```

---

### 7.13 WORKER LOCATIONS (Real-time, Hot Table)

```sql
CREATE TABLE worker_locations (
  worker_id   UUID PRIMARY KEY REFERENCES worker_profiles(id) ON DELETE CASCADE,
  lat         DECIMAL(10,8) NOT NULL,
  lon         DECIMAL(11,8) NOT NULL,
  accuracy_m  DECIMAL(8,2),
  heading     DECIMAL(5,2),           -- degrees north
  speed_kmh   DECIMAL(8,2),
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The most critical index in the entire system
CREATE INDEX idx_worker_locations_geom ON worker_locations USING GIST(geom);

-- Location history: track during active jobs only
CREATE TABLE location_history (
  id          BIGSERIAL PRIMARY KEY,   -- bigserial for high-volume insert performance
  worker_id   UUID NOT NULL REFERENCES worker_profiles(id),
  job_id      UUID,                    -- FK to jobs added after jobs table
  lat         DECIMAL(10,8) NOT NULL,
  lon         DECIMAL(11,8) NOT NULL,
  geom        GEOGRAPHY(POINT, 4326) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (recorded_at);   -- monthly partitions

-- Create initial partitions
CREATE TABLE location_history_2025_01 PARTITION OF location_history
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
-- Add partitions monthly via cron

CREATE INDEX idx_location_history_job ON location_history(job_id, recorded_at DESC);
CREATE INDEX idx_location_history_worker ON location_history(worker_id, recorded_at DESC);
```

---

### 7.14 JOBS

```sql
CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id),
  worker_id         UUID REFERENCES worker_profiles(id),
  service_id        UUID REFERENCES services(id),
  package_id        UUID REFERENCES packages(id),
  category_id       UUID NOT NULL REFERENCES categories(id),
  offer_id          UUID REFERENCES offers(id),
  
  job_type          VARCHAR(20) NOT NULL,
  -- 'instant' | 'discovery'
  
  status            VARCHAR(30) NOT NULL DEFAULT 'requested',
  -- requested → searching → assigned → en_route → arrived → started → completed
  -- Any → cancelled | failed
  
  title             VARCHAR(200),
  description       TEXT,
  
  -- Location (stored for immutability — even if user changes address later)
  location_lat      DECIMAL(10,8) NOT NULL,
  location_lon      DECIMAL(11,8) NOT NULL,
  location_address  TEXT NOT NULL,
  location_area     VARCHAR(100),         -- Pune area (Kothrud, Hinjewadi, etc.)
  location_geom     GEOGRAPHY(POINT, 4326) NOT NULL,
  location_note     TEXT,                 -- delivery instructions
  
  scheduled_at      TIMESTAMPTZ,          -- null = ASAP (instant)
  
  -- Pricing (all stored for audit)
  quoted_price      DECIMAL(10,2),
  final_price       DECIMAL(10,2),
  commission_rate   DECIMAL(5,4),         -- rate at time of job (locked in)
  platform_fee      DECIMAL(10,2),
  gst_on_fee        DECIMAL(10,2),
  worker_payout     DECIMAL(10,2),
  
  -- Matching metadata
  search_radius_km  DECIMAL(5,2),
  workers_notified  INTEGER NOT NULL DEFAULT 0,
  dispatch_rounds   INTEGER NOT NULL DEFAULT 0,
  
  -- Media attached by user
  job_photos        TEXT[],               -- Cloudinary URLs
  
  -- Timing
  assigned_at       TIMESTAMPTZ,
  en_route_at       TIMESTAMPTZ,
  arrived_at        TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,
  
  cancellation_reason TEXT,
  cancelled_by      VARCHAR(20),          -- 'user' | 'worker' | 'system' | 'admin'
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE location_history ADD CONSTRAINT fk_location_job 
  FOREIGN KEY (job_id) REFERENCES jobs(id);

CREATE INDEX idx_jobs_user ON jobs(user_id, created_at DESC);
CREATE INDEX idx_jobs_worker ON jobs(worker_id, created_at DESC) WHERE worker_id IS NOT NULL;
CREATE INDEX idx_jobs_status_active ON jobs(status, created_at) 
  WHERE status IN ('requested', 'searching', 'assigned', 'en_route', 'arrived', 'started');
CREATE INDEX idx_jobs_category ON jobs(category_id, created_at DESC);
CREATE INDEX idx_jobs_geom ON jobs USING GIST(location_geom);
```

---

### 7.15 JOB WORKER REQUESTS (Dispatch Log)

```sql
CREATE TABLE job_worker_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_id         UUID NOT NULL REFERENCES worker_profiles(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
  radius_km         DECIMAL(5,2) NOT NULL,
  distance_km       DECIMAL(5,2),
  score_at_dispatch DECIMAL(6,4),
  notified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,        -- notified_at + 10 seconds
  responded_at      TIMESTAMPTZ,
  rejection_reason  VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_requests_job ON job_worker_requests(job_id, status);
CREATE INDEX idx_job_requests_pending ON job_worker_requests(job_id, expires_at) 
  WHERE status = 'pending';
CREATE INDEX idx_job_requests_worker ON job_worker_requests(worker_id, created_at DESC);
```

---

### 7.16 JOB EVENTS (Audit Trail)

```sql
CREATE TABLE job_events (
  id         BIGSERIAL PRIMARY KEY,
  job_id     UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status     VARCHAR(30) NOT NULL,
  actor      VARCHAR(20) NOT NULL,        -- 'user' | 'worker' | 'system' | 'admin'
  actor_id   UUID NOT NULL,
  lat        DECIMAL(10,8),
  lon        DECIMAL(11,8),
  metadata   JSONB NOT NULL DEFAULT '{}',
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_events_job ON job_events(job_id, created_at);
```

---

### 7.17 REVIEWS

```sql
CREATE TABLE reviews (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                UUID NOT NULL UNIQUE REFERENCES jobs(id),
  reviewer_id           UUID NOT NULL REFERENCES users(id),
  worker_id             UUID NOT NULL REFERENCES worker_profiles(id),
  service_id            UUID REFERENCES services(id),
  rating                DECIMAL(3,2) NOT NULL CHECK (rating >= 1 AND rating <= 5),
  quality_rating        DECIMAL(3,2),
  punctuality_rating    DECIMAL(3,2),
  communication_rating  DECIMAL(3,2),
  value_rating          DECIMAL(3,2),
  text                  TEXT,
  photos                TEXT[],             -- Cloudinary URLs
  is_flagged            BOOLEAN NOT NULL DEFAULT false,
  flag_reason           TEXT,
  reply                 TEXT,               -- Worker reply
  reply_at              TIMESTAMPTZ,
  is_visible            BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_worker ON reviews(worker_id, created_at DESC) WHERE is_visible = true;
CREATE INDEX idx_reviews_service ON reviews(service_id, rating DESC) WHERE is_visible = true;
```

---

### 7.18 PAYMENTS

```sql
CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id                UUID NOT NULL UNIQUE REFERENCES jobs(id),
  user_id               UUID NOT NULL REFERENCES users(id),
  amount                DECIMAL(10,2) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'INR',
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'order_created' | 'paid' | 'held' | 'released' | 'refunded' | 'failed' | 'disputed'
  payment_method        VARCHAR(20),        -- 'upi' | 'card' | 'netbanking' | 'wallet'
  razorpay_order_id     VARCHAR(60) UNIQUE,
  razorpay_payment_id   VARCHAR(60) UNIQUE,
  razorpay_signature    TEXT,
  held_at               TIMESTAMPTZ,
  escrow_release_due_at TIMESTAMPTZ,        -- held_at + 2 hours
  escrow_released_at    TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,
  refund_amount         DECIMAL(10,2),
  refund_reason         TEXT,
  last_webhook_event    VARCHAR(50),
  last_webhook_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_status ON payments(status, escrow_release_due_at) 
  WHERE status = 'held';
CREATE INDEX idx_payments_user ON payments(user_id, created_at DESC);
```

---

### 7.19 PAYOUTS

```sql
CREATE TABLE payouts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id             UUID NOT NULL REFERENCES worker_profiles(id),
  payment_id            UUID NOT NULL REFERENCES payments(id),
  job_id                UUID NOT NULL REFERENCES jobs(id),
  gross_amount          DECIMAL(10,2) NOT NULL,
  platform_fee          DECIMAL(10,2) NOT NULL,
  gst_on_fee            DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tds_deducted          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  net_amount            DECIMAL(10,2) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'processing' | 'completed' | 'failed' | 'on_hold'
  razorpay_transfer_id  VARCHAR(60),
  processed_at          TIMESTAMPTZ,
  failure_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_worker ON payouts(worker_id, created_at DESC);
CREATE INDEX idx_payouts_pending ON payouts(status, created_at) WHERE status = 'pending';
```

---

### 7.20 CHATS

```sql
CREATE TABLE chats (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id      UUID NOT NULL UNIQUE REFERENCES jobs(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  worker_id   UUID NOT NULL REFERENCES worker_profiles(id),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ
);

CREATE INDEX idx_chats_user ON chats(user_id, is_active);
CREATE INDEX idx_chats_worker ON chats(worker_id, is_active);
```

---

### 7.21 MESSAGES

```sql
CREATE TABLE messages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id        UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id      UUID NOT NULL REFERENCES users(id),
  sender_role    VARCHAR(10) NOT NULL,     -- 'user' | 'worker' | 'system'
  type           VARCHAR(10) NOT NULL DEFAULT 'text',  -- 'text' | 'image' | 'system'
  -- raw_content: NEVER returned to client. Stored encrypted at rest via Supabase.
  -- Access: admin only via secure internal endpoint
  raw_content    TEXT,
  -- content: phone-masked version (this is what clients always receive)
  content        TEXT,
  media_url      TEXT,                     -- Cloudinary URL for image messages
  system_event   VARCHAR(50),              -- 'job_started' | 'worker_arrived' etc
  is_read        BOOLEAN NOT NULL DEFAULT false,
  read_at        TIMESTAMPTZ,
  is_deleted     BOOLEAN NOT NULL DEFAULT false,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX idx_messages_unread ON messages(chat_id, is_read) 
  WHERE is_read = false AND is_deleted = false;
```

---

### 7.22 NOTIFICATIONS

```sql
CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id),
  type           VARCHAR(50) NOT NULL,
  title          VARCHAR(200) NOT NULL,
  body           TEXT NOT NULL,
  data           JSONB NOT NULL DEFAULT '{}',    -- navigation target, job_id, etc.
  is_read        BOOLEAN NOT NULL DEFAULT false,
  read_at        TIMESTAMPTZ,
  email_sent     BOOLEAN NOT NULL DEFAULT false,
  email_sent_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
-- Supabase Realtime broadcasts INSERT events on this table automatically
```

---

### 7.23 SUPPORT TICKETS

```sql
CREATE TABLE support_tickets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID REFERENCES jobs(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  worker_id     UUID REFERENCES worker_profiles(id),
  assigned_to   UUID REFERENCES users(id),          -- admin user
  type          VARCHAR(30) NOT NULL,
  -- 'dispute' | 'refund_request' | 'complaint' | 'verification_issue' 
  -- | 'payment_issue' | 'other'
  status        VARCHAR(20) NOT NULL DEFAULT 'open',
  -- 'open' | 'in_progress' | 'awaiting_user' | 'resolved' | 'closed'
  priority      VARCHAR(10) NOT NULL DEFAULT 'medium',
  -- 'low' | 'medium' | 'high' | 'urgent'
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL,
  resolution    TEXT,
  refund_amount DECIMAL(10,2),
  refund_status VARCHAR(20),
  -- 'pending' | 'approved' | 'rejected' | 'processed'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE support_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  sender_role VARCHAR(10) NOT NULL,    -- 'user' | 'worker' | 'admin'
  content     TEXT NOT NULL,
  attachments TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_status ON support_tickets(status, priority, created_at) 
  WHERE status NOT IN ('closed', 'resolved');
CREATE INDEX idx_tickets_job ON support_tickets(job_id);
CREATE INDEX idx_support_msgs_ticket ON support_messages(ticket_id, created_at);
```

---

### 7.24 SOS EVENTS

```sql
CREATE TABLE sos_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id            UUID NOT NULL REFERENCES jobs(id),
  triggered_by      UUID NOT NULL REFERENCES users(id),
  triggered_by_role VARCHAR(10) NOT NULL,
  lat               DECIMAL(10,8),
  lon               DECIMAL(11,8),
  status            VARCHAR(20) NOT NULL DEFAULT 'active',
  notes             TEXT,
  acknowledged_by   UUID REFERENCES users(id),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sos_active ON sos_events(status, created_at DESC) WHERE status = 'active';
```

---

### 7.25 CANCELLATION PENALTIES

```sql
CREATE TABLE cancellation_penalties (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id       UUID NOT NULL REFERENCES jobs(id),
  charged_to   UUID NOT NULL REFERENCES users(id),
  charged_role VARCHAR(10) NOT NULL,           -- 'user' | 'worker'
  amount       DECIMAL(10,2) NOT NULL,
  reason       VARCHAR(100) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'charged' | 'waived'
  waived_by    UUID REFERENCES users(id),
  waived_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_penalties_user ON cancellation_penalties(charged_to, status);
```

---

### 7.26 SEARCH HISTORY

```sql
CREATE TABLE search_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id),
  query             TEXT NOT NULL,
  detected_mode     VARCHAR(20),                -- 'instant' | 'discovery' | 'both'
  category_id       UUID REFERENCES categories(id),
  result_clicked_id UUID,
  result_type       VARCHAR(20),                -- 'service' | 'worker' | 'package'
  session_id        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_history_user ON search_history(user_id, created_at DESC);
-- Partial index for recommendation queries (last 30 days only)
CREATE INDEX idx_search_recent ON search_history(user_id, category_id, created_at DESC)
  WHERE created_at > NOW() - INTERVAL '30 days';
```

---

### 7.27 USER PREFERENCES

```sql
CREATE TABLE user_preferences (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  top_categories   JSONB NOT NULL DEFAULT '[]',  -- [{id, count, last_used}]
  top_tags         JSONB NOT NULL DEFAULT '[]',
  preferred_mode   VARCHAR(20) DEFAULT 'instant',
  home_lat         DECIMAL(10,8),
  home_lon         DECIMAL(11,8),
  home_address     TEXT,
  pune_area        VARCHAR(100),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 7.28 WORKER ANALYTICS (Denormalized)

```sql
CREATE TABLE worker_analytics (
  worker_id               UUID PRIMARY KEY REFERENCES worker_profiles(id),
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
  top_category_id         UUID REFERENCES categories(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### 7.29 PLATFORM CONFIG

```sql
CREATE TABLE platform_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id)
);

-- Seed:
INSERT INTO platform_config (key, value, description) VALUES
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
```

---

### 7.30 PUNE AREAS (for UI dropdowns and filtering)

```sql
CREATE TABLE pune_areas (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name      VARCHAR(100) NOT NULL UNIQUE,
  lat       DECIMAL(10,8) NOT NULL,
  lon       DECIMAL(11,8) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO pune_areas (name, lat, lon) VALUES
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
  ('Kondhwa',         18.4660, 73.8911);
```

---

## 8. MATCHING ENGINE

### 8.1 Core Dispatcher

```python
# services/matching.py

import asyncio
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

async def dispatch_job(job_id: str, db: AsyncSession):
    """
    Uber-style expanding radius matching.
    Called as FastAPI BackgroundTask immediately after job creation.
    """
    config = await get_config(db)
    radius = float(config['matching_initial_radius_km'])
    max_r  = float(config['matching_max_radius_km'])
    step   = float(config['matching_radius_step_km'])
    timeout = int(config['matching_request_timeout_sec'])
    max_w  = int(config['max_workers_per_dispatch'])
    
    job = await get_job(db, job_id)
    await set_job_status(db, job_id, 'searching')
    
    while radius <= max_r:
        # 1. Find available workers in radius
        workers = await find_workers_in_radius(db, job, radius)
        
        if workers:
            ranked = rank_workers_for_instant(workers, job)[:max_w]
            
            # 2. Create pending requests in DB
            request_ids = []
            expires = datetime.utcnow() + timedelta(seconds=timeout)
            for w in ranked:
                req_id = await create_job_request(
                    db, job_id, w.worker_id, radius, w.distance_km, w.score, expires
                )
                request_ids.append(req_id)
            
            # 3. Send FCM push to all workers simultaneously
            # Phase 1: Use Supabase Realtime instead (notify workers via channel)
            await notify_workers_realtime(ranked, job)
            await update_job(db, job_id, {
                'workers_notified': job.workers_notified + len(ranked),
                'dispatch_rounds': job.dispatch_rounds + 1
            })
            
            # 4. Poll for acceptance every 500ms for 10 seconds
            winner = await poll_for_acceptance(db, job_id, request_ids, timeout)
            
            if winner:
                await assign_job_to_worker(db, job_id, winner.worker_id)
                await cancel_other_requests(db, job_id, exclude_id=winner.id)
                await set_worker_status(db, winner.worker_id, 'busy')
                await create_chat(db, job_id, job.user_id, winner.worker_id)
                await notify_user_job_assigned(job.user_id, winner, job)
                return  # SUCCESS
            
            # 5. No one accepted — mark expired, expand radius
            await expire_requests(db, request_ids)
        
        radius += step
    
    # Exhausted all radius — no match
    await set_job_status(db, job_id, 'failed')
    await notify_user_no_workers(job.user_id)
```

### 8.2 Worker Ranking Formula

```python
import math

def rank_workers_for_instant(workers: list, job) -> list:
    """
    Weighted score for instant job dispatch.
    Weights sum to 1.0. Applied once per dispatch round.
    """
    scored = []
    for w in workers:
        # Distance: 0km = 1.0, 5km = 0.0
        dist_score = max(0, 1.0 - (w.distance_km / 5.0))
        
        # Rating: 5.0 = 1.0, 0.0 = 0.0
        rating_score = float(w.avg_rating) / 5.0
        
        # Acceptance rate: already 0.0–1.0
        accept_score = float(w.acceptance_rate)
        
        # Completion count: log scale, 100 jobs = max score
        completion_score = min(math.log10(max(w.total_jobs_completed, 1)) / 2.0, 1.0)
        
        # Response time: <30s = 1.0, 300s+ = 0.0
        response_score = max(0, 1.0 - (w.avg_response_time_sec / 300.0))
        
        base_score = (
            0.30 * dist_score +       # closest worker first
            0.20 * rating_score +     # quality
            0.15 * accept_score +     # reliability
            0.15 * completion_score + # experience
            0.10 * response_score +   # responsiveness
            0.10 * 1.0                # price placeholder
        )
        
        # Multiply by cancellation decay (0.0–1.0)
        # Workers who cancel get penalized multiplicatively
        final_score = base_score * float(w.cancellation_score)
        
        scored.append((final_score, w))
    
    return [w for _, w in sorted(scored, key=lambda x: x[0], reverse=True)]
```

### 8.3 PostGIS Matching Query

```sql
SELECT
  wp.id AS worker_id,
  u.full_name,
  u.avatar_url,
  wp.avg_rating,
  wp.acceptance_rate,
  wp.completion_rate,
  wp.cancellation_score,
  wp.total_jobs_completed,
  wp.avg_response_time_sec,
  ST_Distance(
    wl.geom::geography,
    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
  ) / 1000.0 AS distance_km
FROM worker_profiles wp
JOIN users u ON u.id = wp.user_id
JOIN worker_locations wl ON wl.worker_id = wp.id
JOIN worker_categories wc ON wc.worker_id = wp.id AND wc.category_id = :category_id
WHERE wp.status = 'online'
  AND wp.verification_status = 'approved'
  AND wp.is_instant_available = true
  AND (wp.auto_offline_until IS NULL OR wp.auto_offline_until < NOW())
  -- Location updated within last 2 minutes (stale location = offline effectively)
  AND wl.updated_at > NOW() - INTERVAL '2 minutes'
  -- Not already requested for this job
  AND wp.id NOT IN (
    SELECT worker_id FROM job_worker_requests WHERE job_id = :job_id
  )
  -- Within radius
  AND ST_DWithin(
    wl.geom::geography,
    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
    :radius_meters
  )
ORDER BY distance_km ASC
LIMIT 10;
```

### 8.4 Anti-Gaming Logic

```python
async def on_worker_reject(db, worker_id: str):
    worker = await get_worker(db, worker_id)
    config = await get_config(db)
    threshold = int(config['auto_offline_reject_threshold'])  # 5
    
    new_rejects = worker.consecutive_rejects + 1
    if new_rejects >= threshold:
        duration = int(config['auto_offline_duration_min'])
        await update_worker(db, worker_id, {
            'consecutive_rejects': 0,
            'status': 'offline',
            'auto_offline_until': datetime.utcnow() + timedelta(minutes=duration)
        })
        # Notify worker via Realtime
        await notify_worker_auto_offline(worker_id, duration)
    else:
        await update_worker(db, worker_id, {'consecutive_rejects': new_rejects})

async def on_worker_cancel(db, worker_id: str, job_id: str):
    worker = await get_worker(db, worker_id)
    config = await get_config(db)
    decay = float(config['cancellation_decay_on_cancel'])  # 0.10
    
    new_score = max(0.0, float(worker.cancellation_score) - decay)
    await update_worker(db, worker_id, {
        'cancellation_score': new_score,
        'consecutive_rejects': 0   # reset — they accepted, just cancelled
    })
    await create_penalty(db, job_id, worker_id, 'worker', amount=100.0)

# Daily cron: recover cancellation scores slightly for active workers
async def daily_score_recovery(db):
    recovery = float(config['cancellation_recovery_per_job'])  # 0.02
    await db.execute("""
        UPDATE worker_profiles
        SET cancellation_score = LEAST(1.0, cancellation_score + :recovery)
        WHERE cancellation_score < 1.0
          AND total_jobs_completed > 0
          AND verification_status = 'approved'
    """, {"recovery": recovery})
```

---

## 9. SEARCH & RECOMMENDATIONS

### 9.1 Intent Detection

```python
# Keyword sets (extend freely — no code redeploy needed if stored in DB)
INSTANT_SIGNALS = {
    'now', 'urgent', 'asap', 'immediately', 'quickly', 'fast', 'emergency',
    'broken', 'not working', 'stopped working', 'leaking', 'flooded',
    'fix', 'repair', 'today', 'right now', 'near me', 'nearby', 'help me',
    'quick', 'as soon as', 'come now', 'banda chahiye', 'abhi'
}

DISCOVERY_SIGNALS = {
    'wedding', 'event', 'birthday', 'anniversary', 'function', 'ceremony',
    'reception', 'engagements', 'sangeet',
    'schedule', 'book for', 'hire', 'professional', 'experienced',
    'portfolio', 'packages', 'rates', 'quote', 'next week', 'next month',
    'upcoming', 'planning', 'future', 'for my', 'looking for'
}

def detect_intent(query: str) -> dict:
    q = query.lower().strip()
    words = set(q.split())
    instant_hits = words & INSTANT_SIGNALS
    discovery_hits = words & DISCOVERY_SIGNALS
    
    if len(instant_hits) > len(discovery_hits):
        mode = 'instant'
    elif len(discovery_hits) > len(instant_hits):
        mode = 'discovery'
    else:
        mode = 'both'
    
    return {'mode': mode, 'instant_signals': list(instant_hits)}
```

### 9.2 Unified Search Query

```sql
-- Services search (discovery + both-mode categories)
SELECT
  'service'        AS result_type,
  s.id             AS id,
  s.title          AS name,
  s.price,
  s.avg_rating,
  s.total_bookings,
  wp.id            AS worker_id,
  u.full_name      AS worker_name,
  u.avatar_url,
  c.name           AS category_name,
  c.icon_name      AS category_icon,
  (
    ts_rank(s.search_vector, websearch_to_tsquery('english', :query)) * 0.4 +
    similarity(s.title, :query) * 0.3 +
    (s.avg_rating / 5.0) * 0.2 +
    (LEAST(s.total_bookings, 100) / 100.0) * 0.1
  ) AS relevance_score
FROM services s
JOIN worker_profiles wp ON wp.id = s.worker_id
JOIN users u ON u.id = wp.user_id
JOIN categories c ON c.id = s.category_id
WHERE s.is_active = true
  AND wp.verification_status = 'approved'
  AND (
    s.search_vector @@ websearch_to_tsquery('english', :query)
    OR s.title ILIKE '%' || :query || '%'
    OR similarity(s.title, :query) > 0.15
  )
  AND (:category_id IS NULL OR s.category_id = :category_id::uuid)
ORDER BY relevance_score DESC
LIMIT 20 OFFSET :offset;
```

### 9.3 Recommendation Engine (pure SQL)

```sql
-- Step 1: Get user's top 3 categories from last 30 days
WITH top_cats AS (
  SELECT category_id, COUNT(*) AS freq
  FROM search_history
  WHERE user_id = :user_id
    AND created_at > NOW() - INTERVAL '30 days'
    AND category_id IS NOT NULL
  GROUP BY category_id
  ORDER BY freq DESC
  LIMIT 3
),
-- Step 2: Get top services in those categories
top_services AS (
  SELECT
    s.id, s.title, s.price, s.avg_rating, s.total_bookings,
    tc.freq AS user_affinity,
    wp.id AS worker_id, u.full_name AS worker_name, u.avatar_url,
    c.name AS category_name, c.icon_name,
    -- Score: rating × affinity × recency of bookings
    (
      (s.avg_rating / 5.0) * 0.4 +
      (LEAST(s.total_bookings, 200) / 200.0) * 0.3 +
      (tc.freq::decimal / 10.0) * 0.3
    ) AS recommendation_score
  FROM services s
  JOIN worker_profiles wp ON wp.id = s.worker_id
  JOIN users u ON u.id = wp.user_id
  JOIN categories c ON c.id = s.category_id
  JOIN top_cats tc ON tc.category_id = s.category_id
  WHERE s.is_active = true
    AND wp.verification_status = 'approved'
    AND wp.status IN ('online', 'offline')  -- show discovery regardless of online status
    -- Don't recommend services the user already booked
    AND s.id NOT IN (
      SELECT service_id FROM jobs WHERE user_id = :user_id AND service_id IS NOT NULL
    )
  ORDER BY recommendation_score DESC
  LIMIT 10
)
SELECT * FROM top_services;
-- Fallback if no history: featured services (is_featured categories, highest rated)
```

---

## 10. CHAT & PHONE MASKING

### 10.1 Phone Masking (Server-side, $0 cost, fully feasible)

```python
import re

# Covers all common Indian phone number formats
PHONE_PATTERNS = [
    re.compile(r'(?:\+91|0091|91)?[\s\-]?[6-9]\d{9}'),  # Mobile
    re.compile(r'\b0\d{2,4}[\s\-]?\d{6,8}\b'),          # Landline
]
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
SOCIAL_PATTERNS = [
    re.compile(r'whatsapp\s*[\:\-]?\s*[\d\s\+\-]+', re.IGNORECASE),
    re.compile(r'insta(?:gram)?\s*[\:\-]?\s*@?\w+', re.IGNORECASE),
    re.compile(r'telegram\s*[\:\-]?\s*@?\w+', re.IGNORECASE),
]

def sanitize_message(text: str) -> str:
    """
    Applied on EVERY message insert.
    raw_content = original (stored, never returned to client)
    content = sanitized (this is what clients see)
    """
    for pattern in PHONE_PATTERNS:
        text = pattern.sub('📵 [Number Hidden]', text)
    text = EMAIL_PATTERN.sub('📧 [Email Hidden]', text)
    for pattern in SOCIAL_PATTERNS:
        text = pattern.sub('💬 [Contact Hidden]', text)
    return text

# In message creation endpoint:
async def create_message(db, chat_id, sender_id, raw_text):
    # Verify chat is active and job is assigned (not just requested)
    chat = await get_chat(db, chat_id)
    job = await get_job(db, chat.job_id)
    
    if job.status not in ('assigned', 'en_route', 'arrived', 'started', 'completed'):
        raise HTTPException(403, "Chat not available until job is assigned")
    
    sanitized = sanitize_message(raw_text)
    msg = await insert_message(db, {
        'chat_id': chat_id,
        'sender_id': sender_id,
        'raw_content': raw_text,    # stored, never exposed
        'content': sanitized,       # always returned to clients
    })
    
    # Supabase Realtime broadcasts the INSERT automatically
    # Both user and worker UIs subscribed to messages:{chat_id} channel
    return msg
```

### 10.2 Real-time Chat via Supabase Realtime

```typescript
// Both user and worker apps use same pattern
function useChatMessages(chatId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  
  useEffect(() => {
    // Load existing messages
    loadMessages(chatId).then(setMessages)
    
    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`
      }, (payload) => {
        // Note: payload.new.content is already sanitized
        // raw_content is NEVER in the payload (RLS + select policy excludes it)
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()
    
    return () => supabase.removeChannel(channel)
  }, [chatId])
  
  return messages
}

// RLS ensures raw_content is never accessible:
CREATE POLICY "messages_no_raw_content" ON messages
  FOR SELECT USING (
    -- Participants can read messages, but raw_content is never in SELECT
    -- Achieved via a view that excludes raw_content
    auth.uid() = sender_id OR
    auth.uid() IN (
      SELECT user_id FROM chats WHERE id = chat_id
      UNION
      SELECT wp.user_id FROM chats c 
        JOIN worker_profiles wp ON wp.id = c.worker_id 
        WHERE c.id = chat_id
    )
  );
-- Create view without raw_content for client use
CREATE VIEW messages_safe AS
  SELECT id, chat_id, sender_id, sender_role, type, content, 
         media_url, system_event, is_read, read_at, created_at
  FROM messages WHERE is_deleted = false;
```

---

## 11. PAYMENTS & ESCROW

### 11.1 Payment Flow (Mandatory Razorpay)

```
1. Job created → status = 'requested'
2. Worker accepts → status = 'assigned'
3. User sees: "Pay ₹350 to confirm booking"
4. POST /payments/create-order
   → Calculate final price (quoted_price or service.price)
   → Calculate commission (instant=15% or discovery sliding scale)
   → Create Razorpay order
   → Insert payment record (status='order_created')
   → Return { razorpay_order_id, amount, key_id }
5. Frontend opens Razorpay checkout
6. User pays (UPI/Card/Netbanking)
7. Razorpay → POST /payments/webhook
   → Verify signature: HMAC-SHA256(order_id + '|' + payment_id, secret)
   → If verified:
     → payment.status = 'paid' then 'held' (escrow begins)
     → payment.held_at = NOW()
     → payment.escrow_release_due_at = NOW() + 2 hours
     → job.status = 'en_route' (worker can now navigate)
     → Log job_event: payment_received
     → Send notification to both user and worker
8. APScheduler (every 15min): release due escrows
   → SELECT payments WHERE status='held' AND escrow_release_due_at <= NOW()
   → If no open dispute:
     → payment.status = 'released'
     → Create payout record
     → Call Razorpay Route API to transfer net_amount to worker
   → If dispute open: hold, flag for admin review
```

### 11.2 Commission Calculation

```python
def calculate_job_financials(job_type: str, amount: float) -> dict:
    if job_type == 'instant':
        commission_rate = 0.15
    else:  # discovery
        # Sliding scale: 10% at ₹0, 15% at ₹50,000+
        min_rate, max_rate, scale = 0.10, 0.15, 50_000
        commission_rate = min_rate + (max_rate - min_rate) * min(amount / scale, 1.0)
        commission_rate = round(commission_rate, 4)
    
    platform_fee = round(amount * commission_rate, 2)
    gst_on_fee = round(platform_fee * 0.18, 2)  # 18% GST
    worker_payout = round(amount - platform_fee - gst_on_fee, 2)
    
    return {
        'amount': amount,
        'commission_rate': commission_rate,
        'platform_fee': platform_fee,
        'gst_on_fee': gst_on_fee,
        'worker_payout': worker_payout
    }
```

---

## 12. UI/UX DESIGN SYSTEM

### 12.1 Design Tokens

```css
/* tailwind.config.js theme extension */
:root {
  /* Backgrounds */
  --bg-base:      #07090F;   /* deep space */
  --bg-surface:   #0D1117;   /* card/panel */
  --bg-elevated:  #141B26;   /* hover/selected */
  --bg-glass:     rgba(13, 17, 23, 0.75);
  
  /* Brand */
  --brand:        #4B7BFF;   /* Kaargar blue */
  --brand-hover:  #6B94FF;
  --instant:      #22C55E;   /* green = now */
  --discovery:    #F59E0B;   /* amber = explore */
  
  /* Text */
  --text-primary:   #F0F4FF;
  --text-secondary: #94A3B8;
  --text-muted:     #475569;
  
  /* Border */
  --border:         rgba(255,255,255,0.08);
  --border-hover:   rgba(75,123,255,0.35);
  
  /* Status */
  --success: #22C55E;
  --warning: #F59E0B;
  --error:   #EF4444;
  --info:    #3B82F6;
}
```

### 12.2 shadcn Configuration

```typescript
// tailwind.config.ts — extend shadcn defaults with Kaargar tokens
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background:   'hsl(var(--background))',
        foreground:   'hsl(var(--foreground))',
        brand:        { DEFAULT: '#4B7BFF', hover: '#6B94FF' },
        instant:      '#22C55E',
        discovery:    '#F59E0B',
        surface:      '#0D1117',
        elevated:     '#141B26',
      },
      fontFamily: {
        // Syne for headings/display
        display: ['Syne', 'sans-serif'],
        // DM Sans for body
        sans:    ['DM Sans', 'sans-serif'],
        // JetBrains Mono for numbers/stats (worker app)
        mono:    ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      backdropBlur: {
        glass: '20px',
      },
      boxShadow: {
        'brand-glow': '0 8px 32px rgba(75, 123, 255, 0.35)',
        'instant-glow': '0 8px 32px rgba(34, 197, 94, 0.30)',
        'glass': '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'slide-up':      'slideUp 0.35s ease both',
        'fade-scale':    'fadeScale 0.25s ease both',
        'search-pulse':  'searchPulse 2s ease-in-out infinite',
        'ripple':        'ripple 1.5s ease-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
```

### 12.3 Global Styles

```css
/* globals.css — shadcn dark theme overrides for Kaargar */

:root {
  --background: 215 30% 5%;        /* #07090F */
  --foreground: 220 50% 95%;       /* #F0F4FF */
  --card: 215 28% 8%;              /* #0D1117 */
  --card-foreground: 220 50% 95%;
  --primary: 225 100% 65%;         /* #4B7BFF */
  --primary-foreground: 0 0% 100%;
  --secondary: 215 25% 12%;
  --secondary-foreground: 220 50% 85%;
  --muted: 215 20% 15%;
  --muted-foreground: 215 15% 55%;
  --accent: 215 25% 14%;
  --accent-foreground: 220 50% 90%;
  --border: 215 20% 15%;
  --ring: 225 100% 65%;
  --radius: 0.75rem;
}

/* Glass card utility */
.glass {
  background: rgba(13, 17, 23, 0.75);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.07);
  box-shadow: 0 4px 24px rgba(0,0,0,0.4), 
              inset 0 1px 0 rgba(255,255,255,0.06);
}

/* Mode toggle (custom, not shadcn) */
.mode-pill {
  background: var(--card);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 100px;
  padding: 4px;
  display: flex;
  gap: 2px;
}
.mode-pill .active {
  background: var(--primary);
  border-radius: 100px;
  box-shadow: 0 4px 16px rgba(75,123,255,0.4);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Animations */
@keyframes slideUp {
  from { transform: translateY(16px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
@keyframes searchPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(75,123,255,0.5); }
  50%       { box-shadow: 0 0 0 20px rgba(75,123,255,0); }
}
```

---

## 13. USER APP — SCREEN-BY-SCREEN

### App Structure
```
src/
├── pages/
│   ├── auth/          Login, OTP verify
│   ├── home/          Instant + Discovery home
│   ├── job/           Request, Searching, Active, Complete
│   ├── discovery/     Browse, Worker profile, Service detail, Book
│   ├── bookings/      History, Upcoming, Active
│   ├── chat/          Conversation view
│   ├── support/       Ticket creation, history
│   └── profile/       Settings, account
├── components/
│   ├── ui/            shadcn auto-generated
│   ├── kaargar/       Custom branded components
│   │   ├── ModeToggle.tsx
│   │   ├── CategoryGrid.tsx
│   │   ├── JobStatusTimeline.tsx
│   │   ├── WorkerCard.tsx
│   │   ├── MapView.tsx
│   │   ├── SearchBar.tsx
│   │   └── NotificationDrawer.tsx
│   └── layout/        AppLayout, Navbar, BottomNav
```

### Screen: Home (Instant Mode)
```tsx
// Instant Mode Layout
<AppLayout>
  {/* Header */}
  <div className="flex items-center justify-between px-4 pt-4 pb-2">
    <LocationSelector />           {/* shadcn Popover with area list */}
    <NotificationDrawer />         {/* shadcn Sheet */}
  </div>

  {/* Search */}
  <SearchBar 
    placeholder="What do you need help with?"
    onSearch={handleSearch}
    className="mx-4 mb-4"
  />

  {/* Category Grid */}
  <div className="px-4">
    <SectionHeader title="Get help now" action="See all" />
    <CategoryGrid 
      categories={instantCategories}  // fetched, not hardcoded
      columns={4}
      onSelect={handleCategorySelect}
    />
  </div>

  {/* Recent Bookings */}
  {recentBookings.length > 0 && (
    <div className="px-4 mt-6">
      <SectionHeader title="Recent" />
      <ScrollArea orientation="horizontal">
        {recentBookings.map(b => <RecentBookingChip key={b.id} booking={b} />)}
      </ScrollArea>
    </div>
  )}

  {/* Bottom Mode Toggle — fixed */}
  <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50">
    <ModeToggle 
      mode={mode}          // 'instant' | 'discovery'
      onChange={setMode}
    />
  </div>

  {/* Bottom Navigation */}
  <BottomNav />
</AppLayout>
```

### Screen: Searching for Worker
```tsx
// Full-screen map with animated search state
<div className="h-screen relative">
  <MapboxMap 
    center={job.location}
    workerDots={nearbyWorkers}  // dots on map, not names
    className="h-full"
  />
  
  {/* Animated overlay */}
  <div className="absolute inset-0 pointer-events-none">
    <SearchRipple center={job.location} />   {/* expanding circles */}
  </div>

  {/* Bottom sheet (shadcn Sheet) */}
  <Sheet defaultOpen side="bottom" modal={false}>
    <SheetContent className="glass rounded-t-3xl">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 border border-brand/20">
          <Loader2 className="h-4 w-4 animate-spin text-brand" />
          <span className="text-sm font-medium">Searching nearby workers...</span>
        </div>
        
        {/* Worker avatars appearing */}
        <WorkerSearchProgress 
          workersContacted={job.workers_notified}
          radius={job.search_radius_km}
        />
        
        <p className="text-muted-foreground text-sm">
          Checking workers within {job.search_radius_km}km
        </p>
        
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleCancel}
        >
          Cancel
        </Button>
      </div>
    </SheetContent>
  </Sheet>
</div>
```

### Screen: Worker Assigned
```tsx
// Job assigned — worker info + live map
<div className="h-screen relative">
  <MapboxMap 
    workerLocation={workerLocation}   // updates via Realtime
    userLocation={job.location}
    showRoute={true}
  />

  <Sheet defaultOpen side="bottom" modal={false}>
    <SheetContent className="glass rounded-t-3xl">
      {/* Worker card */}
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={worker.avatar_url} />
          <AvatarFallback>{worker.full_name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h3 className="font-display font-semibold text-lg">{worker.full_name}</h3>
          <div className="flex items-center gap-2">
            <StarRating value={worker.avg_rating} />
            <span className="text-sm text-muted-foreground">
              {worker.total_jobs_completed} jobs
            </span>
          </div>
        </div>
        <Badge className="bg-instant/10 text-instant border-instant/20">
          {eta} min
        </Badge>
      </div>

      {/* Status timeline */}
      <JobStatusTimeline 
        statuses={['assigned', 'en_route', 'arrived', 'started', 'completed']}
        current={job.status}
        className="mt-4"
      />

      {/* Actions */}
      <div className="flex gap-3 mt-4">
        <Button className="flex-1" variant="outline" asChild>
          <Link to={`/chat/${job.chat_id}`}>
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat
          </Link>
        </Button>
        <Button variant="destructive" size="icon" onClick={handleSOS}>
          <AlertTriangle className="h-4 w-4" />
        </Button>
      </div>
    </SheetContent>
  </Sheet>
</div>
```

### Screen: Discovery — Worker Profile
```tsx
<ScrollArea className="h-screen">
  {/* Hero media */}
  <div className="relative h-64">
    {featuredMedia.type === 'video' ? (
      <video src={featuredMedia.url} autoPlay muted loop className="w-full h-full object-cover" />
    ) : (
      <img src={featuredMedia.cloudinary_url} className="w-full h-full object-cover" />
    )}
    <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
    
    {/* Worker info overlay */}
    <div className="absolute bottom-4 left-4 right-4">
      <h1 className="font-display font-bold text-2xl">{worker.full_name}</h1>
      <div className="flex items-center gap-2 mt-1">
        <StarRating value={worker.avg_rating} />
        <span className="text-sm text-white/70">{worker.rating_count} reviews</span>
        <span className="text-sm text-white/70">•</span>
        <span className="text-sm text-white/70">{worker.total_jobs_completed} jobs</span>
      </div>
    </div>
  </div>

  {/* Tabs: shadcn Tabs */}
  <Tabs defaultValue="services" className="px-4 pt-4">
    <TabsList className="w-full">
      <TabsTrigger value="services" className="flex-1">Services</TabsTrigger>
      <TabsTrigger value="portfolio" className="flex-1">Portfolio</TabsTrigger>
      <TabsTrigger value="reviews" className="flex-1">Reviews</TabsTrigger>
    </TabsList>

    <TabsContent value="services" className="space-y-3 mt-4">
      {services.map(service => (
        <ServiceCard key={service.id} service={service} onBook={handleBook} />
      ))}
      {packages.map(pkg => (
        <PackageCard key={pkg.id} package={pkg} onBook={handleBook} />
      ))}
    </TabsContent>

    <TabsContent value="portfolio">
      <div className="grid grid-cols-3 gap-1 mt-4">
        {media.map(m => <MediaThumbnail key={m.id} item={m} />)}
      </div>
    </TabsContent>

    <TabsContent value="reviews" className="space-y-4 mt-4">
      {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
    </TabsContent>
  </Tabs>

  {/* Sticky bottom CTA */}
  <div className="sticky bottom-0 p-4 glass border-t border-border">
    <Button className="w-full" size="lg" onClick={handleBookNow}>
      Book Now
    </Button>
  </div>
</ScrollArea>
```

---

## 14. WORKER APP — SCREEN-BY-SCREEN

### App Structure (separate route group `/worker/*`)
```
/worker/
├── dashboard       Home — earnings, status toggle, active job
├── jobs            Job history, upcoming
├── services        Manage services, packages, offers
├── media           Upload photos/videos/reels
├── analytics       Charts, performance metrics
├── chat/:id        Chat with customer
├── profile         Edit profile, documents, payout
└── support         Support tickets
```

### Screen: Worker Dashboard
```tsx
<div className="min-h-screen bg-[#07090F] p-4 space-y-4">
  {/* Status toggle — most prominent element */}
  <Card className="glass border-border">
    <CardContent className="flex items-center justify-between p-4">
      <div>
        <p className="text-sm text-muted-foreground">Status</p>
        <p className={cn(
          "font-display font-bold text-xl",
          isOnline ? "text-instant" : "text-muted-foreground"
        )}>
          {isOnline ? "ONLINE" : "OFFLINE"}
        </p>
        {isOnline && <p className="text-xs text-muted-foreground">Accepting jobs</p>}
      </div>
      <Switch 
        checked={isOnline}
        onCheckedChange={handleStatusToggle}
        className="scale-125 data-[state=checked]:bg-instant"
      />
    </CardContent>
  </Card>

  {/* Today's earnings */}
  <Card className="glass">
    <CardContent className="p-4">
      <p className="text-sm text-muted-foreground">Today's Earnings</p>
      <p className="font-mono text-4xl font-bold text-foreground mt-1">
        ₹{analytics.today_earnings.toLocaleString('en-IN')}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="secondary">{analytics.today_jobs} jobs</Badge>
        {analytics.today_earnings > 0 && (
          <span className="text-xs text-instant">+12% vs yesterday</span>
        )}
      </div>
    </CardContent>
  </Card>

  {/* Quick stats */}
  <div className="grid grid-cols-3 gap-3">
    <StatCard label="Rating" value={`${worker.avg_rating}★`} />
    <StatCard label="Acceptance" value={`${(worker.acceptance_rate*100).toFixed(0)}%`} />
    <StatCard label="Total Jobs" value={worker.total_jobs_completed} />
  </div>

  {/* Active job (if any) */}
  {activeJob && <ActiveJobCard job={activeJob} />}

  {/* Recent jobs */}
  <div>
    <h3 className="font-display font-semibold mb-3">Recent Jobs</h3>
    <div className="space-y-2">
      {recentJobs.map(j => <JobHistoryRow key={j.id} job={j} />)}
    </div>
  </div>
</div>
```

### Screen: Incoming Job Request (Critical UX)
```tsx
// Full-screen modal — appears over everything, blocks navigation
<AlertDialog open={hasIncomingJob} onOpenChange={() => {}}>
  <AlertDialogContent className="glass max-w-sm mx-auto rounded-3xl border-brand/20">
    {/* Header */}
    <div className="text-center space-y-1">
      <Badge className="bg-instant/10 text-instant border-instant/20 animate-pulse">
        New Job Request
      </Badge>
      <h2 className="font-display font-bold text-2xl mt-2">
        {incomingJob.category.name}
      </h2>
    </div>

    {/* Job details */}
    <div className="glass rounded-2xl p-4 space-y-3">
      <DetailRow 
        icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
        label="Location"
        value={`${incomingJob.location_area} • ${incomingJob.distance_km}km away`}
      />
      <DetailRow
        icon={<IndianRupee className="h-4 w-4 text-muted-foreground" />}
        label="Est. Earnings"
        value={`₹${estimatedEarnings}`}
      />
      {incomingJob.description && (
        <DetailRow
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          label="Details"
          value={incomingJob.description}
        />
      )}
    </div>

    {/* Timer */}
    <div className="space-y-2">
      <Progress value={timeLeft * 10} className="h-2" />
      <p className="text-center text-sm text-muted-foreground">
        Auto-declines in <span className="font-mono font-bold text-foreground">{timeLeft}s</span>
      </p>
    </div>

    {/* CTA buttons */}
    <div className="grid grid-cols-2 gap-3">
      <Button 
        variant="outline" 
        className="h-14 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={handleDecline}
      >
        <X className="h-5 w-5 mr-2" />
        Decline
      </Button>
      <Button 
        className="h-14 bg-instant hover:bg-instant/90 font-bold text-lg shadow-instant-glow"
        onClick={handleAccept}
      >
        <Check className="h-5 w-5 mr-2" />
        Accept
      </Button>
    </div>
  </AlertDialogContent>
</AlertDialog>
```

### Screen: Worker Analytics
```tsx
<ScrollArea className="h-screen p-4">
  {/* Period selector */}
  <Tabs defaultValue="month" className="mb-6">
    <TabsList>
      <TabsTrigger value="today">Today</TabsTrigger>
      <TabsTrigger value="week">Week</TabsTrigger>
      <TabsTrigger value="month">Month</TabsTrigger>
      <TabsTrigger value="all">All Time</TabsTrigger>
    </TabsList>
  </Tabs>

  {/* Earnings chart */}
  <Card className="glass mb-4">
    <CardHeader>
      <CardTitle className="font-display text-lg">
        ₹{analytics.month_earnings.toLocaleString('en-IN')}
      </CardTitle>
      <CardDescription>This month's earnings</CardDescription>
    </CardHeader>
    <CardContent>
      <EarningsLineChart data={earningsData} />  {/* Recharts */}
    </CardContent>
  </Card>

  {/* Performance metrics */}
  <Card className="glass mb-4">
    <CardHeader><CardTitle className="font-display">Performance</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <MetricBar label="Acceptance Rate" value={worker.acceptance_rate * 100} color="instant" />
      <MetricBar label="Completion Rate" value={worker.completion_rate * 100} color="brand" />
      <MetricBar label="Cancellation Score" value={worker.cancellation_score * 100} color="warning" />
      
      <div className="grid grid-cols-2 gap-3 pt-2">
        <StatCard label="Avg Rating" value={`${worker.avg_rating} ★`} />
        <StatCard label="Avg Response" value={`${worker.avg_response_time_sec}s`} />
      </div>
    </CardContent>
  </Card>
</ScrollArea>
```

---

## 15. ADMIN PANEL

### Access Control
```
Route: /admin (separate app section or subdomain admin.kaargar.in)
Auth: Same JWT, but role = 'admin' checked via middleware
RLS: admin bypass policies on all tables
```

### Pages
```
/admin/
├── dashboard        Live overview (jobs map, fill rate, active workers)
├── workers/
│   ├── pending      Verification queue
│   ├── approved     All verified workers
│   └── [id]         Worker detail
├── jobs/            All jobs with filters
├── users/           User management
├── support/
│   ├── open         Open tickets
│   └── [id]         Ticket detail with full job context
├── payments/        Payments, payouts, refunds
└── config/          Platform config editor
```

### Live Dashboard Layout (shadcn DataTable + Charts)
```tsx
// Key shadcn components: Card, Table, Badge, Select, DatePicker, Progress
<div className="grid grid-cols-4 gap-4 mb-6">
  <MetricCard title="Active Jobs"    value={live.active_jobs}    icon={<Briefcase />} />
  <MetricCard title="Online Workers" value={live.online_workers} icon={<Users />} color="instant" />
  <MetricCard title="Today Revenue"  value={`₹${live.revenue}`} icon={<IndianRupee />} color="brand" />
  <MetricCard title="Fill Rate"      value={`${live.fill_rate}%`} icon={<TrendingUp />} />
</div>

{/* Live jobs map */}
<Card className="mb-6 h-96">
  <CardContent className="p-0 h-full">
    <AdminMapView jobs={liveJobs} workers={onlineWorkers} />
  </CardContent>
</Card>

{/* Recent jobs table */}
<DataTable 
  columns={jobColumns} 
  data={recentJobs}
  filters={['status', 'category', 'type']}
/>
```

---

## 16. API DESIGN

### Base URL: `https://api.kaargar.in/v1`

### Auth
```
POST /auth/send-otp              { email }
POST /auth/verify-otp            { email, token } → { access_token, refresh_token, user }
POST /auth/refresh               { refresh_token }
POST /auth/logout
```

### Users
```
GET    /users/me
PATCH  /users/me                 { full_name, phone, avatar_url }
GET    /users/me/preferences
PUT    /users/me/preferences     { home_lat, home_lon, pune_area }
```

### Categories
```
GET    /categories               ?mode=instant|discovery|both
```

### Search
```
GET    /search                   ?q=...&mode=...&category_slug=...&page=1&limit=20
GET    /search/recommendations   (personalized, auth required)
GET    /search/workers           ?category=...&lat=...&lon=...&page=1 (discovery browse)
```

### Jobs
```
POST   /jobs                     { category_id, job_type, lat, lon, address, 
                                   description?, photos?: string[], scheduled_at? }
GET    /jobs/:id
GET    /jobs/:id/worker-location (polls, updates via Realtime in parallel)
POST   /jobs/:id/cancel          { reason }
POST   /jobs/:id/sos
GET    /jobs/me                  ?status=active|upcoming|past&page=1
```

### Workers — Public
```
GET    /workers/:id              (public profile)
GET    /workers/:id/services     
GET    /workers/:id/packages
GET    /workers/:id/media
GET    /workers/:id/reviews      ?page=1
```

### Workers — Self (authenticated worker)
```
POST   /worker/profile           (create profile, onboarding)
PATCH  /worker/profile
PATCH  /worker/status            { status: online|offline }
PATCH  /worker/instant           { is_instant_available: bool }

POST   /worker/documents         multipart: { type, file }
GET    /worker/documents

POST   /worker/location          { lat, lon, accuracy?, heading? }

GET    /worker/services
POST   /worker/services
PATCH  /worker/services/:id
DELETE /worker/services/:id

GET    /worker/packages
POST   /worker/packages
PATCH  /worker/packages/:id
DELETE /worker/packages/:id

GET    /worker/offers
POST   /worker/offers
PATCH  /worker/offers/:id
DELETE /worker/offers/:id

GET    /worker/media
POST   /worker/media             { cloudinary_url, cloudinary_id, type, service_id? }
PATCH  /worker/media/:id         { sort_order, is_featured, caption }
DELETE /worker/media/:id

GET    /worker/analytics         ?period=today|week|month|all
GET    /worker/jobs              ?status=&page=1
POST   /worker/jobs/:id/accept
POST   /worker/jobs/:id/reject   { reason }
POST   /worker/jobs/:id/arrived
POST   /worker/jobs/:id/start
POST   /worker/jobs/:id/complete { final_price }

GET    /worker/earnings          ?period=month
```

### Chat
```
GET    /chat/:job_id             (chat metadata + recent 50 messages)
POST   /chat/:job_id/messages    { content, type? }
POST   /chat/:job_id/messages/image { cloudinary_url }
PATCH  /chat/:job_id/read        (mark messages read)
```

### Payments
```
POST   /payments/create-order    { job_id } → { razorpay_order_id, amount, key_id }
POST   /payments/webhook         (Razorpay webhook — public, verified via signature)
GET    /payments/:job_id
POST   /payments/:job_id/dispute { reason }
```

### Reviews
```
POST   /reviews                  { job_id, rating, text?, photos? }
GET    /reviews/worker/:id       ?page=1
POST   /reviews/:id/reply        { reply } — worker only
```

### Notifications
```
GET    /notifications            ?page=1&unread_only=false
PATCH  /notifications/read-all
PATCH  /notifications/:id/read
```

### Support
```
POST   /support/tickets          { type, title, description, job_id? }
GET    /support/tickets          (user's own tickets)
GET    /support/tickets/:id
POST   /support/tickets/:id/messages { content }
```

### Admin
```
GET    /admin/dashboard/live
GET    /admin/jobs               ?status=...&category=...&type=...&page=1
GET    /admin/workers/pending
POST   /admin/workers/:id/approve
POST   /admin/workers/:id/reject { reason }
POST   /admin/workers/:id/suspend { reason }
GET    /admin/support/tickets    ?status=open&priority=high
PATCH  /admin/support/:id        { status, assigned_to, resolution }
POST   /admin/support/:id/messages
POST   /admin/payments/:id/refund { amount, reason }
POST   /admin/penalties/:id/waive
GET    /admin/config
PATCH  /admin/config             { key, value }
GET    /admin/sos/active
PATCH  /admin/sos/:id/acknowledge
PATCH  /admin/sos/:id/resolve
```

---

## 17. INFRASTRUCTURE — PHASE 1

### Hosting (All Free Tier)

| Service | Provider | Free Limit | Purpose |
|---|---|---|---|
| Frontend | **Vercel** | Unlimited (hobby) | React web app |
| Backend | **Railway.app** | $5/month credit (generous) | FastAPI |
| Database | **Supabase** | 500MB / 50K MAU | PostgreSQL + PostGIS + Realtime |
| Media | **Cloudinary** | 25GB storage, 25GB bandwidth | Photos, videos, reels |
| Email | **Resend.com** | 3,000 emails/month | SMTP notifications |
| Maps | **Mapbox** | 50K requests/month | Maps, geocoding |
| Payments | **Razorpay** | No monthly fee (2% per txn) | Payments |
| Auth | **Supabase Auth** | Included | Email OTP |

**Total Phase 1 monthly cost: ~₹0 (Razorpay per-transaction only)**

### Backend Folder Structure
```
kaargar-api/
├── main.py
├── config.py
├── database.py          # SQLAlchemy async engine → Supabase Postgres
├── dependencies.py      # auth middleware, db session
├── routers/
│   ├── auth.py
│   ├── users.py
│   ├── workers.py
│   ├── jobs.py
│   ├── search.py
│   ├── chat.py
│   ├── payments.py
│   ├── reviews.py
│   ├── notifications.py
│   ├── support.py
│   └── admin.py
├── services/
│   ├── matching.py      # dispatch_job, rank_workers
│   ├── search.py        # FTS queries, recommendations
│   ├── notifications.py # SMTP + Realtime
│   ├── payments.py      # Razorpay integration
│   └── media.py         # Cloudinary helpers
├── models/              # SQLAlchemy models (all 30 tables)
├── schemas/             # Pydantic v2 schemas
├── migrations/          # Alembic
│   └── versions/
│       └── 001_initial_schema.py
├── tasks/               # APScheduler jobs
│   ├── escrow_release.py
│   ├── decay_scores.py
│   └── analytics_rollup.py
├── templates/
│   └── email/           # Jinja2 HTML templates
└── tests/
```

### Frontend Folder Structure
```
kaargar-web/
├── public/
├── src/
│   ├── lib/
│   │   ├── supabase.ts       # supabase-js client (anon key only)
│   │   ├── api.ts            # axios instance + React Query setup
│   │   └── utils.ts
│   ├── components/
│   │   ├── ui/               # shadcn (auto-generated, don't modify)
│   │   └── kaargar/          # custom components
│   ├── pages/                # route components
│   ├── stores/               # Zustand stores
│   │   ├── auth.ts
│   │   ├── job.ts
│   │   ├── notifications.ts
│   │   └── worker.ts
│   ├── hooks/                # React Query hooks
│   │   ├── useJob.ts
│   │   ├── useWorker.ts
│   │   ├── useSearch.ts
│   │   └── useNotifications.ts
│   ├── types/                # TypeScript types
│   └── App.tsx
├── tailwind.config.ts
├── components.json           # shadcn config
└── vite.config.ts
```

---

## 18. MIGRATION PLAN — PHASE 2 (AWS)

**Trigger: 500+ active workers OR Supabase free tier limits hit**

### Step 1: Database Migration (1 day)
```bash
# Dump from Supabase
pg_dump "postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres" \
  --no-owner --no-acl -F c -f kaargar_backup.dump

# Restore to AWS RDS PostgreSQL
pg_restore -d "postgresql://[rds-endpoint]:5432/kaargar" \
  --no-owner --no-acl kaargar_backup.dump
```

### Step 2: Media Migration (0 days — already on Cloudinary)
- No migration needed. Cloudinary URLs remain the same.
- If we hit Cloudinary limits: migrate to AWS S3 + CloudFront (same URL pattern)

### Step 3: Auth Migration (1 day)
- Switch from Supabase Auth to custom FastAPI OTP + JWT
- Users re-login on next session (graceful — tokens expire anyway)
- MSG91/Twilio configured for SMS OTP

### Step 4: Realtime Migration (1 day)
- Switch from Supabase Realtime to FastAPI WebSocket endpoint
- Frontend: change Supabase channel subscription to WebSocket connection
- Redis Pub/Sub for WebSocket scaling across multiple EC2 instances

**Total migration: 3 days. Zero rewrite of business logic.**

---

## 19. BUILD PLAN

### Day 1 — Foundation
- [ ] Create Supabase project, run full schema migration (all 30 tables + extensions + seed data)
- [ ] Configure Supabase Auth (email OTP, SMTP via Resend.com)
- [ ] Configure RLS policies on all tables
- [ ] FastAPI project scaffold (all routers, models, schemas)
- [ ] Database connection (async SQLAlchemy → Supabase Postgres)
- [ ] Auth endpoints: send-otp, verify-otp, JWT creation
- [ ] React app scaffold (Vite + TypeScript + shadcn init + Tailwind config)
- [ ] Design tokens, globals.css, font imports
- [ ] Login/OTP screen (shadcn Form + Input + OTP input)

### Day 2 — Worker Onboarding + Core Data
- [ ] Worker profile creation API + form (shadcn multi-step form)
- [ ] Category selection (shadcn ToggleGroup)
- [ ] Document upload (Cloudinary signed upload + worker_documents table)
- [ ] Service CRUD (shadcn Sheet/Dialog forms)
- [ ] Package CRUD
- [ ] Worker location WebSocket endpoint (heartbeat every 5s)
- [ ] Admin: verification queue page + approve/reject flow

### Day 3 — Instant Job Flow
- [ ] Job creation endpoint (instant mode)
- [ ] Matching engine (dispatch_job background task, PostGIS query)
- [ ] Supabase Realtime: worker receives job request notification
- [ ] Incoming job request UI (AlertDialog with 10s timer)
- [ ] Accept/reject endpoints + anti-gaming logic
- [ ] Job status progression endpoints (en_route, arrived, start, complete)
- [ ] User-side: searching state, worker assigned state, live tracking

### Day 4 — Payments + Chat
- [ ] Razorpay: create-order endpoint, webhook handler, signature verification
- [ ] Payment flow UI (Razorpay JS SDK integration)
- [ ] Escrow simulation (held → released via APScheduler)
- [ ] Payout creation
- [ ] Chat: message creation with phone masking
- [ ] Chat UI (shadcn ScrollArea + Input)
- [ ] Supabase Realtime chat subscription

### Day 5 — Discovery Mode
- [ ] Postgres FTS + pg_trgm search endpoint
- [ ] Intent detection (keyword classifier)
- [ ] Search results UI (shadcn Command for search, Card grid for results)
- [ ] Worker public profile page (Tabs: Services, Portfolio, Reviews)
- [ ] Service booking flow (discovery → schedule → pay)
- [ ] Recommendation engine SQL query + API endpoint
- [ ] Discovery home feed (personalized + featured)

### Day 6 — Notifications + Reviews + Support
- [ ] Notification service (SMTP via Resend + Realtime insert)
- [ ] Email templates (all 10 templates)
- [ ] Notification drawer UI (shadcn Sheet + ScrollArea)
- [ ] Review submission (after job complete, shadcn rating + form)
- [ ] Worker reply to review
- [ ] Support ticket creation + messaging
- [ ] Admin support dashboard

### Day 7 — Worker App Completion
- [ ] Worker analytics page (Recharts line chart, metric bars)
- [ ] Worker media upload (Cloudinary direct upload, portfolio grid)
- [ ] Package/offer management UI
- [ ] Payout details form (UPI/bank account)
- [ ] Worker notification handling (incoming job via Realtime)

### Day 8 — Admin Panel + Polish
- [ ] Admin live dashboard (DataTable jobs, worker stats)
- [ ] Admin map view (Mapbox, live job + worker positions)
- [ ] SOS handling UI
- [ ] Cancellation penalties UI
- [ ] Platform config editor (shadcn Form)
- [ ] Loading skeletons everywhere (shadcn Skeleton)
- [ ] Error boundaries + fallback UI
- [ ] Empty states (no bookings, no workers found, etc.)

### Day 9 — QA + Security
- [ ] JWT middleware: role enforcement on all protected routes
- [ ] RLS audit: every table has correct policies
- [ ] Phone masking: test all edge cases
- [ ] Razorpay webhook: HMAC signature verification tested
- [ ] Matching engine: concurrent jobs test
- [ ] Mobile responsiveness: 375px, 430px, 768px
- [ ] Accessibility: keyboard nav, ARIA labels (shadcn handles most)

### Day 10 — Deploy
- [ ] Deploy backend to Railway.app
- [ ] Deploy frontend to Vercel
- [ ] Configure domain kaargar.in + api.kaargar.in
- [ ] Environment variables audit (no secrets in frontend)
- [ ] Create seed accounts: 3 test users, 5 test workers (Pune areas)
- [ ] Create admin account
- [ ] End-to-end test: full instant job lifecycle
- [ ] End-to-end test: full discovery booking lifecycle
- [ ] Verify email notifications arrive
- [ ] Soft launch 🚀

---

## OPEN ITEMS (Resolved)

| Question | Answer |
|---|---|
| App name | **Kaargar** |
| Launch city | **Pune only** |
| Instant commission | **15% flat** |
| Discovery commission | **10–15% sliding scale** |
| Payments | **Mandatory Razorpay** |
| Notifications Phase 1 | **SMTP (Resend.com) + Supabase Realtime in-app** |
| OTP auth | **Email OTP via Supabase Auth (SMTP)** |
| SMS capability | **Abstracted, ready to swap to MSG91/Twilio** |
| Frontend type | **React Web App (not PWA, React Native = Phase 3)** |
| UI library | **shadcn/ui extensively** |
| Phase 1 infra | **Supabase + Vercel + Railway + Cloudinary** |
| Phase 2 infra | **AWS (triggered at scale)** |

---

*Document: KAARGAR_SYSTEM_DESIGN_v2.md*  
*Version: 2.0 | Date: April 2026*  
*Status: ✅ DESIGN LOCKED — Begin Day 1 Implementation*
