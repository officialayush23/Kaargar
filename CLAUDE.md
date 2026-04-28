# KAARGAR — Claude Code Build Context
## Full project specification. Read entirely before writing any code.

---

## PROJECT OVERVIEW

**App:** Kaargar — dual-mode hyperlocal services platform, Pune only  
**Modes:** Instant (Uber-like real-time matching) + Discovery (browse & book)  
**Stack:** FastAPI + React (Vite + JSX) + Supabase + Redis  
**Status:** Database is fully deployed. Build backend + frontend from scratch.

---

## CRITICAL RULES

1. Frontend: **React + Vite + JSX only** — NO TypeScript, NO .tsx files
2. Backend: **ALL models in `models.py`**, **ALL pydantic schemas in `schemas.py`** — no exceptions
3. Media uploads: **Supabase Storage only** — two buckets exist: `profile_photos`, `worker_posts`
4. No Cloudinary. No AWS S3. Only Supabase Storage.
5. Auth: **Supabase email OTP** → custom JWT for API calls
6. Real-time: **Supabase Realtime** subscriptions on frontend
7. Background jobs: **APScheduler** inside FastAPI process (no Celery/Redis queue)
8. Redis: used for **rate limiting + job dispatch locks** only (Upstash free tier)
9. Payments: **Razorpay mandatory** — no cash option
10. Notifications: **SMTP email + Supabase Realtime in-app** — no push/FCM

---

## REPOSITORY STRUCTURE

```
kaargar/
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py          ← ALL SQLAlchemy models here
│   ├── schemas.py         ← ALL Pydantic schemas here
│   ├── dependencies.py
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py
│   │   ├── categories.py
│   │   ├── jobs.py
│   │   ├── workers.py
│   │   ├── search.py
│   │   ├── chat.py
│   │   ├── payments.py
│   │   ├── reviews.py
│   │   ├── notifications.py
│   │   ├── upload.py       ← Supabase Storage upload endpoints
│   │   └── admin.py
│   ├── services/
│   │   ├── __init__.py
│   │   ├── matching.py
│   │   ├── notifications.py
│   │   └── storage.py      ← Supabase Storage helpers
│   ├── tasks/
│   │   ├── escrow_release.py
│   │   └── decay_scores.py
│   ├── templates/email/    ← Jinja2 HTML email templates
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── vite.config.js      ← .js not .ts
    ├── package.json
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── globals.css
        ├── lib/
        │   ├── api.js
        │   ├── supabase.js
        │   └── utils.js
        ├── stores/
        │   ├── auth.js
        │   └── app.js
        ├── hooks/
        │   ├── useCategories.js
        │   ├── useJobs.js
        │   ├── useWorker.js
        │   └── useNotifications.js
        ├── components/
        │   ├── ui/          ← shadcn components (manually added, JSX)
        │   ├── kaargar/
        │   │   ├── ModeToggle.jsx
        │   │   ├── CategoryGrid.jsx
        │   │   ├── WorkerCard.jsx
        │   │   ├── JobStatusTimeline.jsx
        │   │   ├── NotificationDrawer.jsx
        │   │   ├── SearchBar.jsx
        │   │   └── MediaUpload.jsx    ← Supabase Storage upload UI
        │   └── layout/
        │       ├── AppLayout.jsx
        │       └── WorkerLayout.jsx
        └── pages/
            ├── auth/
            │   └── LoginPage.jsx
            ├── home/
            │   └── HomePage.jsx       ← PRIORITY: build this first
            ├── job/
            │   ├── NewJobPage.jsx
            │   ├── SearchingPage.jsx
            │   └── ActiveJobPage.jsx
            ├── discovery/
            │   ├── DiscoveryPage.jsx
            │   └── WorkerProfilePage.jsx
            ├── bookings/
            │   └── BookingsPage.jsx
            ├── chat/
            │   └── ChatPage.jsx
            ├── profile/
            │   └── ProfilePage.jsx
            └── worker/
                ├── WorkerDashboard.jsx
                ├── IncomingJobModal.jsx
                ├── WorkerAnalytics.jsx
                ├── WorkerServices.jsx
                ├── WorkerMedia.jsx    ← upload to worker_posts bucket
                └── WorkerProfile.jsx  ← upload to profile_photos bucket
```

---

## ENVIRONMENT VARIABLES

### Backend `.env`
```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql+asyncpg://postgres:password@db.your-project.supabase.co:5432/postgres

# JWT (our own, separate from Supabase JWT)
JWT_SECRET_KEY=minimum-32-character-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Redis (Upstash)
REDIS_URL=redis://default:password@your-upstash-host.upstash.io:6379

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx

# SMTP (Resend.com recommended)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=re_xxx
SMTP_FROM_EMAIL=noreply@kaargar.in
SMTP_FROM_NAME=Kaargar

# App
APP_ENV=development
FRONTEND_URL=http://localhost:5173
```

### Frontend `.env`
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:8000/v1
VITE_RAZORPAY_KEY_ID=rzp_test_xxx
```

---

## SUPABASE STORAGE — BUCKETS & POLICIES

Two buckets already created in Supabase dashboard:
- `profile_photos` — public bucket, worker avatar + profile images
- `worker_posts` — public bucket, worker portfolio images + videos

### Storage RLS Policies to run in Supabase SQL Editor:

```sql
-- profile_photos: anyone can read, authenticated workers can upload their own
CREATE POLICY "profile_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile_photos');

CREATE POLICY "profile_photos_worker_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile_photos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_worker_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "profile_photos_worker_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile_photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- worker_posts: anyone can read, authenticated workers can manage their own
CREATE POLICY "worker_posts_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'worker_posts');

CREATE POLICY "worker_posts_worker_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'worker_posts'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "worker_posts_worker_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'worker_posts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "worker_posts_worker_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'worker_posts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
```

### Upload path convention:
```
profile_photos/{user_id}/avatar.jpg
profile_photos/{user_id}/cover.jpg

worker_posts/{user_id}/{timestamp}_{filename}
worker_posts/{user_id}/{timestamp}_thumbnail.jpg
```

### Public URL pattern:
```
{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
```

---

## DATABASE — ALREADY DEPLOYED

All 31 tables are live. Key tables for reference:

```
users, worker_profiles, worker_documents, worker_categories,
categories, tags, services, service_tags, service_media,
packages, package_services, offers,
worker_locations, location_history,
jobs, job_worker_requests, job_events,
reviews, payments, payouts, chats, messages,
notifications, support_tickets, support_messages,
sos_events, cancellation_penalties,
search_history, user_preferences, worker_analytics,
platform_config, pune_areas
```

### service_media table stores worker posts:
```sql
service_media (
  id, worker_id, service_id (nullable),
  type VARCHAR(10),       -- 'image' | 'video' | 'reel'
  cloudinary_url TEXT,    -- RENAMED FIELD — store Supabase Storage URL here
  cloudinary_id TEXT,     -- store storage path here (for deletion)
  thumbnail_url TEXT,
  caption TEXT,
  duration_sec INTEGER,
  sort_order INTEGER,
  is_featured BOOLEAN,
  view_count INTEGER,
  created_at
)
```
Note: `cloudinary_url` and `cloudinary_id` column names remain (schema already deployed) but store Supabase Storage URLs/paths.

### worker_profiles avatar stored in users table:
```sql
users.avatar_url TEXT  -- store Supabase Storage public URL
```

---

## BACKEND — FastAPI

### requirements.txt
```
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.14.0
pydantic==2.10.3
pydantic-settings==2.7.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
httpx==0.28.1
aiosmtplib==3.0.2
jinja2==3.1.4
python-multipart==0.0.19
apscheduler==3.10.4
geoalchemy2==0.15.2
supabase==2.11.0
redis==5.2.1
razorpay==1.4.2
```

### services/storage.py — Supabase Storage service
```python
"""
Supabase Storage helper.
Handles signed upload URLs and public URL generation.
Buckets: profile_photos, worker_posts
"""
from supabase import create_client
from config import get_settings
import uuid, time

settings = get_settings()
supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

BUCKET_PROFILE = "profile_photos"
BUCKET_POSTS   = "worker_posts"

def get_public_url(bucket: str, path: str) -> str:
    return f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"

def upload_file(bucket: str, path: str, file_bytes: bytes, content_type: str) -> str:
    """Upload bytes, return public URL."""
    supabase.storage.from_(bucket).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return get_public_url(bucket, path)

def delete_file(bucket: str, path: str) -> None:
    supabase.storage.from_(bucket).remove([path])

def profile_photo_path(user_id: str, filename: str = "avatar.jpg") -> str:
    return f"{user_id}/{filename}"

def worker_post_path(user_id: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    return f"{user_id}/{int(time.time())}_{uuid.uuid4().hex[:8]}.{ext}"
```

### routers/upload.py — Upload endpoints
```python
"""
Upload router.
POST /upload/profile-photo  → profile_photos bucket
POST /upload/worker-post    → worker_posts bucket
DELETE /upload/worker-post  → delete from worker_posts
"""
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional

from database import get_db
from models import User, WorkerProfile, ServiceMedia
from schemas import MediaUploadResponse, SuccessResponse
from dependencies import get_current_user, require_worker
from services.storage import (
    upload_file, delete_file,
    profile_photo_path, worker_post_path,
    BUCKET_PROFILE, BUCKET_POSTS
)

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB


@router.post("/profile-photo", response_model=MediaUploadResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Only JPEG/PNG/WebP images allowed")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "Image must be under 10MB")

    path = profile_photo_path(str(user.id))
    url = upload_file(BUCKET_PROFILE, path, data, file.content_type)

    # Update user avatar_url
    user.avatar_url = url
    await db.commit()

    return MediaUploadResponse(url=url, path=path, bucket=BUCKET_PROFILE)


@router.post("/worker-post", response_model=MediaUploadResponse)
async def upload_worker_post(
    file: UploadFile = File(...),
    service_id: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    is_featured: bool = Form(False),
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    is_video = file.content_type in ALLOWED_VIDEO_TYPES
    is_image = file.content_type in ALLOWED_IMAGE_TYPES

    if not is_video and not is_image:
        raise HTTPException(400, "Only images (JPEG/PNG/WebP) or videos (MP4/MOV/WebM) allowed")

    data = await file.read()
    max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE
    if len(data) > max_size:
        raise HTTPException(400, f"File too large (max {'100MB' if is_video else '10MB'})")

    # Get worker profile
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    path = worker_post_path(str(user.id), file.filename or "upload")
    url = upload_file(BUCKET_POSTS, path, data, file.content_type)

    media_type = "video" if is_video else "image"

    # Save to service_media table
    import uuid as _uuid
    media = ServiceMedia(
        worker_id=wp.id,
        service_id=_uuid.UUID(service_id) if service_id else None,
        type=media_type,
        cloudinary_url=url,     # stores Supabase URL despite column name
        cloudinary_id=path,     # stores Supabase path for deletion
        caption=caption,
        is_featured=is_featured,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)

    return MediaUploadResponse(
        url=url, path=path, bucket=BUCKET_POSTS,
        media_id=str(media.id), media_type=media_type,
    )


@router.delete("/worker-post/{media_id}", response_model=SuccessResponse)
async def delete_worker_post(
    media_id: str,
    user: User = Depends(require_worker),
    db: AsyncSession = Depends(get_db),
):
    import uuid as _uuid
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    media_result = await db.execute(
        select(ServiceMedia).where(
            ServiceMedia.id == _uuid.UUID(media_id),
            ServiceMedia.worker_id == wp.id,
        )
    )
    media = media_result.scalar_one_or_none()
    if not media:
        raise HTTPException(404, "Media not found")

    # Delete from Supabase Storage
    delete_file(BUCKET_POSTS, media.cloudinary_id)

    await db.delete(media)
    await db.commit()
    return SuccessResponse(message="Deleted")
```

### schemas.py additions needed (add to existing schemas):
```python
class MediaUploadResponse(BaseModel):
    url: str
    path: str
    bucket: str
    media_id: str | None = None
    media_type: str | None = None

class ServiceMediaResponse(BaseModel):
    id: str
    worker_id: str
    service_id: str | None
    type: str
    url: str           # maps from cloudinary_url
    thumbnail_url: str | None
    caption: str | None
    is_featured: bool
    view_count: int
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='after')
    def map_url(self):
        # alias cloudinary_url → url
        return self
```

---

## FRONTEND — React + Vite + JSX

### package.json dependencies (key ones):
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.47.10",
    "@tanstack/react-query": "^5.62.7",
    "axios": "^1.7.9",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "framer-motion": "^11.15.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-hook-form": "^7.54.2",
    "react-router-dom": "^6.28.0",
    "recharts": "^2.15.0",
    "sonner": "^1.7.1",
    "tailwind-merge": "^2.6.0",
    "tailwindcss-animate": "^1.0.7",
    "zustand": "^5.0.2",
    "zod": "^3.24.1"
  }
}
```

Note: All files are `.jsx` not `.tsx`. No TypeScript. Vite config is `vite.config.js`.

### Design System — Dark Glassmorphism

**Colors:**
```css
:root {
  --bg-base:      #07090F;
  --bg-surface:   #0D1117;
  --bg-elevated:  #141B26;
  --bg-glass:     rgba(13, 17, 23, 0.75);
  --brand:        #4B7BFF;
  --brand-hover:  #6B94FF;
  --instant:      #22C55E;
  --discovery:    #F59E0B;
  --text-primary:   #F0F4FF;
  --text-secondary: #94A3B8;
  --text-muted:     #475569;
  --border:         rgba(255,255,255,0.08);
}
```

**Fonts:** Syne (headings) + DM Sans (body) + JetBrains Mono (numbers/earnings)  
Load from Google Fonts in `index.html`.

**Glass utility classes to define in globals.css:**
```css
.glass { background: rgba(13,17,23,0.75); backdrop-filter: blur(20px) saturate(160%); border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06); }
.glass-light { background: rgba(20,27,38,0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.05); }
.glass-strong { background: rgba(13,17,23,0.92); backdrop-filter: blur(32px) saturate(180%); border: 1px solid rgba(255,255,255,0.1); }
```

**shadcn/ui:** Install manually as JSX components (not via CLI which generates .tsx). Copy components from shadcn website and convert to .jsx by removing type annotations. Key components needed: Button, Card, Badge, Avatar, Sheet, Dialog, AlertDialog, Progress, Tabs, Switch, ScrollArea, Skeleton, Input, Textarea, Toast (use Sonner instead).

### MediaUpload component (components/kaargar/MediaUpload.jsx)
```jsx
/**
 * Handles file upload to Supabase Storage via backend API.
 * For profile photos: POST /upload/profile-photo
 * For worker posts: POST /upload/worker-post
 */
import { useState, useRef } from 'react'
import { api } from '@/lib/api'
import { Upload, X, Loader2 } from 'lucide-react'

export function ProfilePhotoUpload({ currentUrl, onSuccess }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const formData = new FormData()
    formData.append('file', file)
    
    setUploading(true)
    try {
      const { data } = await api.post('/upload/profile-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onSuccess?.(data.url)
    } catch (err) {
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative cursor-pointer" onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      {uploading && <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>}
      {/* Render children (avatar) with upload overlay */}
    </div>
  )
}

export function WorkerPostUpload({ onSuccess, serviceId }) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(null)
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Local preview
    const url = URL.createObjectURL(file)
    setPreview({ url, type: file.type.startsWith('video') ? 'video' : 'image' })

    const formData = new FormData()
    formData.append('file', file)
    if (serviceId) formData.append('service_id', serviceId)

    setUploading(true)
    try {
      const { data } = await api.post('/upload/worker-post', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      onSuccess?.(data)
    } catch (err) {
      setPreview(null)
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" className="hidden" onChange={handleFile} />
      <button onClick={() => inputRef.current?.click()} className="glass-light rounded-xl flex flex-col items-center justify-center gap-2 p-6 w-full hover:border-brand/30 transition-all">
        {uploading ? <Loader2 className="h-8 w-8 animate-spin text-brand" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
        <span className="text-sm text-muted-foreground">{uploading ? 'Uploading...' : 'Tap to add photo or video'}</span>
      </button>
    </div>
  )
}
```

---

## KEY SCREENS TO BUILD

### Priority order:
1. `LoginPage.jsx` — email input → OTP verify → redirect
2. `HomePage.jsx` — dual mode home with floating ModeToggle pill
3. `WorkerDashboard.jsx` — earnings, status toggle, active job
4. `IncomingJobModal.jsx` — full-screen 10s timer, accept/decline
5. `NewJobPage.jsx` — category → location → confirm
6. `SearchingPage.jsx` — map + ripple animation + live search state
7. `ActiveJobPage.jsx` — worker tracking + timeline + chat button
8. `WorkerMedia.jsx` — portfolio grid + upload to worker_posts bucket
9. `WorkerProfile.jsx` — profile edit + upload to profile_photos bucket
10. `DiscoveryPage.jsx` — search + filter + worker cards

### HomePage.jsx — the most important screen:
This is the first thing users see. Must feel premium.
- Dark background (#07090F)
- Ambient gradient glow behind content (green for instant, amber for discovery)
- Location selector (area pill in header)
- Search bar with glass effect
- Mode-specific content animates in/out with Framer Motion
- **Floating mode toggle pill** at `bottom-24` centered, sits above bottom nav
- Bottom nav: Home / Bookings / Chat / Profile (glass rounded pill, not full-width bar)

### ModeToggle.jsx — the Uber/Rapido-style pill:
```jsx
// Floating pill with Instant (green) and Discover (amber) buttons
// Uses Framer Motion layoutId for animated pill transition
// Position: fixed bottom-24 left-1/2 -translate-x-1/2 z-40
// Style: glass-strong rounded-full p-1.5
```

### WorkerMedia.jsx — media portfolio:
- 3-column masonry-style grid
- Each item: image or video thumbnail with play indicator
- Tap to view full screen
- Plus button to add new (opens WorkerPostUpload)
- Upload goes to worker_posts Supabase bucket
- Saves record to service_media table via /upload/worker-post
- Can delete (calls DELETE /upload/worker-post/{id})

---

## MATCHING ENGINE FLOW

Instant job dispatch (background task in matching.py):
```
1. User creates job → POST /jobs (job_type='instant')
2. BackgroundTask: dispatch_job(job_id)
3. Set job.status = 'searching'
4. Loop: radius 2km → 3km → 4km → 5km
   a. PostGIS query: online + approved + instant_available workers within radius
   b. Rank by score (distance 30% + rating 20% + acceptance 15% + completion 15% + response 10% + price 10%) × cancellation_score
   c. Create job_worker_requests records (expires in 10s)
   d. Insert notifications for each worker (Supabase Realtime broadcasts to worker frontend)
   e. Poll DB every 500ms for 10s for acceptance
   f. If winner: assign job, cancel other requests, create chat, notify user
   g. Else: expire requests, expand radius
5. If exhausted all radius: job.status = 'failed', notify user
```

Worker receives job via Supabase Realtime subscription to notifications table.
Worker app shows IncomingJobModal with 10s countdown.
Worker taps Accept → POST /jobs/{id}/accept → marks request accepted → dispatch detects it.

---

## REAL-TIME SUBSCRIPTIONS

Frontend subscribes to these channels after login:

```javascript
// 1. User notifications (new job assigned, payment, etc.)
supabase.channel(`notif:${userId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, handleNotification)
  .subscribe()

// 2. Active job status updates
supabase.channel(`job:${jobId}`)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${jobId}` }, handleJobUpdate)
  .subscribe()

// 3. Chat messages
supabase.channel(`chat:${chatId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, handleMessage)
  .subscribe()

// 4. Worker: incoming job requests
supabase.channel(`worker-requests:${workerId}`)
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_worker_requests', filter: `worker_id=eq.${workerId}` }, handleIncomingJob)
  .subscribe()
```

---

## PHONE MASKING

Applied in backend on every message INSERT:
```python
import re
PHONE_RE = re.compile(r'(?:\+91|0091|91)?[\s\-]?[6-9]\d{9}')
EMAIL_RE = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
SOCIAL_RE = re.compile(r'whatsapp\s*[\:\-]?\s*[\d\s\+\-]+', re.IGNORECASE)

def sanitize(text):
    text = PHONE_RE.sub('[Number Hidden]', text)
    text = EMAIL_RE.sub('[Email Hidden]', text)
    text = SOCIAL_RE.sub('[Contact Hidden]', text)
    return text
```
`raw_content` = original stored in DB (never returned to client)
`content` = sanitized version (always returned)

---

## COMMISSION CALCULATION

```python
def calculate_commission(job_type, amount):
    if job_type == 'instant':
        rate = 0.15
    else:  # discovery: 10% at ₹0, 15% at ₹50,000+
        rate = 0.10 + 0.05 * min(amount / 50_000, 1.0)
        rate = round(rate, 4)
    fee = round(amount * rate, 2)
    gst = round(fee * 0.18, 2)
    payout = round(amount - fee - gst, 2)
    return {'rate': rate, 'fee': fee, 'gst': gst, 'payout': payout}
```

---

## API REFERENCE

Base URL: `/v1`

```
# Auth
POST   /auth/send-otp          { email }
POST   /auth/verify-otp        { email, token } → { access_token, user }

# Categories
GET    /categories              ?mode=instant|discovery|both

# Areas
GET    /categories/areas

# Jobs
POST   /jobs                   { category_id, job_type, location_lat, location_lon, location_address, ... }
GET    /jobs/me                 ?status=active|past
GET    /jobs/{id}
POST   /jobs/{id}/cancel        { reason }
POST   /jobs/{id}/accept        (worker)
POST   /jobs/{id}/reject        { reason } (worker)
POST   /jobs/{id}/arrived       (worker)
POST   /jobs/{id}/start         (worker)
POST   /jobs/{id}/complete      (worker)
POST   /jobs/{id}/sos

# Workers
GET    /workers/{id}
GET    /workers/{id}/services
GET    /workers/{id}/media
GET    /workers/{id}/reviews
POST   /workers/profile
PATCH  /workers/profile
PATCH  /workers/status          { status }
POST   /workers/location        { lat, lon }
POST   /workers/documents       (form-data: type, cloudinary_url, cloudinary_id)
GET    /workers/me/services
POST   /workers/me/services
PATCH  /workers/me/services/{id}
DELETE /workers/me/services/{id}
GET    /workers/me/analytics    ?period=today|week|month|all

# Upload (Supabase Storage)
POST   /upload/profile-photo   (multipart: file)
POST   /upload/worker-post     (multipart: file, service_id?, caption?, is_featured?)
DELETE /upload/worker-post/{media_id}

# Search
GET    /search                  ?q=...&mode=...&page=1
GET    /search/recommendations

# Chat
GET    /chat/{job_id}
GET    /chat/{job_id}/messages
POST   /chat/{job_id}/messages  { content }
PATCH  /chat/{job_id}/read

# Payments
POST   /payments/create-order  { job_id }
POST   /payments/webhook       (Razorpay)
GET    /payments/{job_id}

# Reviews
POST   /reviews                { job_id, rating, text? }
GET    /reviews/worker/{id}

# Notifications
GET    /notifications
PATCH  /notifications/read-all
PATCH  /notifications/{id}/read

# Admin
GET    /admin/dashboard/live
GET    /admin/workers/pending
POST   /admin/workers/{id}/approve
POST   /admin/workers/{id}/reject  { reason }
GET    /admin/config
PATCH  /admin/config
```

---

## REDIS USAGE

```python
import redis.asyncio as redis

# Rate limiting: max 5 OTP sends per email per hour
await r.setex(f"otp_limit:{email}", 3600, 1)

# Job dispatch lock: prevent duplicate dispatches
lock_key = f"dispatch_lock:{job_id}"
acquired = await r.set(lock_key, 1, nx=True, ex=30)  # 30s lock

# Worker location rate limit: max 1 update per 3s
await r.setex(f"loc_limit:{worker_id}", 3, 1)
```

---

## PUNE AREAS (for location selector dropdown)

```
Hinjewadi, Kothrud, Aundh, Baner, Wakad, Pimpri-Chinchwad,
Hadapsar, Kharadi, Viman Nagar, Kalyani Nagar, Koregaon Park,
Camp, Shivajinagar, Deccan, Katraj, Kondhwa, Magarpatta,
Sinhagad Road, Warje, Bavdhan
```

---

## ANTI-GAMING RULES

- Worker rejects 5 jobs in a row → auto-offline for 5 minutes
- Worker cancels accepted job → cancellation_score -= 0.10, penalty ₹100 charged
- Each completed job → cancellation_score += 0.02 (recovery)
- cancellation_score multiplied against ranking score (1.0 = full score, 0.0 = never dispatched)
- Penalty stored in cancellation_penalties table

---

## WHAT ALREADY EXISTS IN REPO

- Database fully migrated (all 31 tables + indexes + triggers + seed data)
- Supabase Storage buckets created: profile_photos, worker_posts
- Environment variables configured

## WHAT TO BUILD

Everything else. Start with:
1. Backend: main.py, config.py, database.py, models.py, schemas.py, dependencies.py
2. Backend routers (all listed above), services/matching.py, services/storage.py, services/notifications.py
3. Frontend: complete React + Vite + JSX app with all pages listed
4. Priority: HomePage.jsx + auth flow + WorkerDashboard.jsx must be fully functional first
