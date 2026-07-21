# KAARGAR — Complete Backend Specification
## For Claude Code: Fix all 404s, add all missing routes, wire everything.

---

## IMMEDIATE FIXES NEEDED (from console errors)

All these return 404. Routes exist in the router file but are MISSING from FastAPI router registration:

```
GET  /v1/workers/me/services     → 404
POST /v1/workers/me/services     → 422 (schema mismatch)
GET  /v1/workers/me/media        → 404
GET  /v1/workers/me/analytics    → 404
```

Root cause: `routers/workers.py` has routes under `/me/...` but they conflict with `/{worker_id}` routes. FastAPI matches `me` as a UUID and fails. Fix by registering the `/me/` sub-router BEFORE the `/{worker_id}` routes.

---

## PROJECT STRUCTURE

```
backend/
├── main.py
├── config.py
├── database.py
├── models.py          ← ALL SQLAlchemy models (already done, do not break)
├── schemas.py         ← ALL Pydantic schemas (already done, extend as needed)
├── dependencies.py
├── routers/
│   ├── __init__.py
│   ├── auth.py
│   ├── users.py
│   ├── workers_public.py   ← GET /workers/{id} and sub-routes (PUBLIC)
│   ├── workers_me.py       ← /workers/me/... (AUTHENTICATED WORKER SELF)
│   ├── categories.py
│   ├── jobs.py
│   ├── jobs_worker.py      ← worker job actions (accept/reject/etc.)
│   ├── search.py
│   ├── chat.py
│   ├── payments.py
│   ├── reviews.py
│   ├── notifications.py
│   ├── upload.py
│   ├── support.py
│   └── admin.py
├── services/
│   ├── __init__.py
│   ├── matching.py
│   ├── notifications.py
│   ├── storage.py
│   └── email.py
├── tasks/
│   ├── __init__.py
│   ├── scheduler.py        ← APScheduler setup
│   ├── escrow_release.py
│   └── decay_scores.py
├── templates/email/
│   ├── base.html
│   ├── otp.html
│   ├── job_assigned.html
│   ├── job_completed.html
│   ├── payment_received.html
│   ├── verification_approved.html
│   └── verification_rejected.html
└── requirements.txt
```

---

## REQUIREMENTS.TXT

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
python-dotenv==1.0.0
```

---

## config.py

```python
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    app_env: str = "development"
    frontend_url: str = "http://localhost:5173"

    # Database — direct Postgres connection to Supabase
    database_url: str  # postgresql+asyncpg://...

    # Supabase (for Auth + Realtime + Storage)
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # JWT (our own tokens, separate from Supabase)
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440  # 24h

    # Redis
    redis_url: str = ""

    # Razorpay
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # SMTP
    smtp_host: str = "smtp.resend.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@kaargar.in"
    smtp_from_name: str = "Kaargar"

    # Mapbox (for server-side geocoding if needed)
    mapbox_token: str = ""

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

---

## database.py

```python
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=300,
)

async_session = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
```

---

## dependencies.py

```python
from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from config import get_settings
from database import get_db
from models import User, WorkerProfile

settings = get_settings()
security = HTTPBearer()

def create_access_token(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    return jwt.encode(
        {"sub": user_id, "role": role, "exp": expire},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(401, "Invalid token")
    except JWTError:
        raise HTTPException(401, "Invalid token")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or inactive")
    if user.is_banned:
        raise HTTPException(403, "Account suspended")
    return user

async def get_current_worker(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, WorkerProfile]:
    """Returns (user, worker_profile). Raises 403 if not a worker."""
    if user.role not in ("worker", "admin"):
        raise HTTPException(403, "Worker access required")
    result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")
    return user, wp

async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user

# Optional auth (for public endpoints that show more if logged in)
async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None
```

---

## main.py

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from tasks.scheduler import start_scheduler, stop_scheduler

# Import all routers
from routers import (
    auth, users, categories,
    workers_public, workers_me,
    jobs, jobs_worker,
    search, chat, payments,
    reviews, notifications,
    upload, support, admin,
)

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    print(f"🔥 Kaargar API starting ({settings.app_env})")
    yield
    stop_scheduler()

app = FastAPI(
    title="Kaargar API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount all routers
app.include_router(auth.router,            prefix="/v1/auth",          tags=["Auth"])
app.include_router(users.router,           prefix="/v1/users",         tags=["Users"])
app.include_router(categories.router,      prefix="/v1/categories",    tags=["Categories"])
app.include_router(workers_me.router,      prefix="/v1/workers/me",    tags=["Workers - Self"])
app.include_router(workers_public.router,  prefix="/v1/workers",       tags=["Workers - Public"])
app.include_router(jobs.router,            prefix="/v1/jobs",          tags=["Jobs"])
app.include_router(jobs_worker.router,     prefix="/v1/jobs",          tags=["Jobs - Worker"])
app.include_router(search.router,          prefix="/v1/search",        tags=["Search"])
app.include_router(chat.router,            prefix="/v1/chat",          tags=["Chat"])
app.include_router(payments.router,        prefix="/v1/payments",      tags=["Payments"])
app.include_router(reviews.router,         prefix="/v1/reviews",       tags=["Reviews"])
app.include_router(notifications.router,   prefix="/v1/notifications", tags=["Notifications"])
app.include_router(upload.router,          prefix="/v1/upload",        tags=["Upload"])
app.include_router(support.router,         prefix="/v1/support",       tags=["Support"])
app.include_router(admin.router,           prefix="/v1/admin",         tags=["Admin"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "kaargar-api", "city": "pune"}

@app.get("/")
async def root():
    return {"service": "Kaargar API", "docs": "/docs"}
```

---

## routers/auth.py

```python
"""
POST /v1/auth/send-otp     { email } → sends OTP via Supabase Auth
POST /v1/auth/verify-otp   { email, token } → { access_token, user }
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from supabase import create_client
from config import get_settings
from database import get_db
from models import User
from schemas import OTPSendRequest, OTPVerifyRequest, TokenResponse, UserResponse
from dependencies import create_access_token

settings = get_settings()
router = APIRouter()
supabase_client = create_client(settings.supabase_url, settings.supabase_service_role_key)

@router.post("/send-otp")
async def send_otp(body: OTPSendRequest):
    try:
        supabase_client.auth.sign_in_with_otp({"email": body.email, "options": {"should_create_user": True}})
        return {"message": "OTP sent", "email": body.email}
    except Exception as e:
        raise HTTPException(400, f"Failed to send OTP: {str(e)}")

@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(body: OTPVerifyRequest, db: AsyncSession = Depends(get_db)):
    try:
        result = supabase_client.auth.verify_otp({
            "email": body.email,
            "token": body.token,
            "type": "email",
        })
    except Exception:
        raise HTTPException(401, "Invalid or expired OTP")

    if not result.user:
        raise HTTPException(401, "Verification failed")

    # The DB trigger handle_new_auth_user creates the user row.
    # Fetch it (may need short retry if trigger is async)
    for _ in range(3):
        user_result = await db.execute(select(User).where(User.email == body.email))
        user = user_result.scalar_one_or_none()
        if user:
            break
        import asyncio
        await asyncio.sleep(0.3)

    if not user:
        # Trigger didn't fire — create manually
        from uuid import UUID
        user = User(
            id=UUID(result.user.id),
            email=body.email,
            email_verified=True,
            role="user",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    token = create_access_token(str(user.id), user.role)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))
```

---

## routers/users.py

```python
"""
GET    /v1/users/me
PATCH  /v1/users/me         { full_name, phone, avatar_url }
PUT    /v1/users/me/preferences  { home_lat, home_lon, home_address, pune_area }
GET    /v1/users/me/preferences
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, UserPreference
from schemas import UserResponse, UserUpdate, UserPreferenceResponse, UserPreferenceUpdate
from dependencies import get_current_user

router = APIRouter()

@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return UserResponse.model_validate(user)

@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)

@router.get("/me/preferences", response_model=UserPreferenceResponse)
async def get_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    pref = result.scalar_one_or_none()
    if not pref:
        pref = UserPreference(user_id=user.id)
        db.add(pref)
        await db.commit()
        await db.refresh(pref)
    return UserPreferenceResponse.model_validate(pref)

@router.put("/me/preferences", response_model=UserPreferenceResponse)
async def update_preferences(
    body: UserPreferenceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )
    pref = result.scalar_one_or_none()
    if not pref:
        pref = UserPreference(user_id=user.id)
        db.add(pref)

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pref, field, value)
    await db.commit()
    await db.refresh(pref)
    return UserPreferenceResponse.model_validate(pref)
```

---

## routers/workers_me.py  ← CRITICAL: fixes all 404s

```python
"""
All authenticated worker SELF endpoints.
Prefix: /v1/workers/me
MUST be registered BEFORE /v1/workers/{id} in main.py
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone, timedelta

from database import get_db
from models import (
    User, WorkerProfile, WorkerCategory, WorkerLocation,
    WorkerDocument, Service, ServiceMedia, WorkerAnalytics,
    Package, PackageService, Offer, LocationHistory, Job,
)
from schemas import (
    WorkerProfileCreate, WorkerProfileUpdate, WorkerProfileResponse,
    WorkerStatusUpdate, WorkerLocationUpdate, WorkerDocumentResponse,
    DocumentUpload, ServiceCreate, ServiceUpdate, ServiceResponse,
    PackageCreate, PackageResponse, PackageUpdate,
    OfferCreate, OfferResponse, OfferUpdate,
    WorkerAnalyticsResponse, MediaResponse, SuccessResponse,
)
from dependencies import get_current_user, get_current_worker, require_worker

router = APIRouter()


# ── PROFILE ──────────────────────────────────────────────────────────
@router.get("/profile", response_model=WorkerProfileResponse)
async def get_my_profile(
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    return WorkerProfileResponse.model_validate(wp)

@router.post("/profile", response_model=WorkerProfileResponse)
async def create_worker_profile(
    body: WorkerProfileCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Worker profile already exists")

    wp = WorkerProfile(
        user_id=user.id,
        bio=body.bio,
        experience_years=body.experience_years,
        pune_area=body.pune_area,
        service_radius_km=body.service_radius_km,
    )
    db.add(wp)
    await db.flush()

    user.role = "worker"
    for i, cat_id in enumerate(body.category_ids):
        db.add(WorkerCategory(
            worker_id=wp.id,
            category_id=cat_id,
            is_primary=(i == 0),
        ))

    db.add(WorkerAnalytics(worker_id=wp.id))
    await db.commit()
    await db.refresh(wp)
    return WorkerProfileResponse.model_validate(wp)

@router.patch("/profile", response_model=WorkerProfileResponse)
async def update_my_profile(
    body: WorkerProfileUpdate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(wp, field, value)
    await db.commit()
    await db.refresh(wp)
    return WorkerProfileResponse.model_validate(wp)


# ── STATUS ───────────────────────────────────────────────────────────
@router.patch("/status", response_model=SuccessResponse)
async def update_status(
    body: WorkerStatusUpdate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    if wp.verification_status != "approved":
        raise HTTPException(403, "Profile not yet approved")
    if body.status == "online" and wp.auto_offline_until:
        if wp.auto_offline_until > datetime.now(timezone.utc):
            raise HTTPException(
                403,
                f"Auto-offline until {wp.auto_offline_until.isoformat()}"
            )
        wp.auto_offline_until = None
    wp.status = body.status
    await db.commit()
    return SuccessResponse(message=f"Status set to {body.status}")


# ── INSTANT MODE TOGGLE ──────────────────────────────────────────────
@router.patch("/instant", response_model=SuccessResponse)
async def toggle_instant(
    body: dict,  # { "is_instant_available": bool }
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    wp.is_instant_available = body.get("is_instant_available", False)
    await db.commit()
    return SuccessResponse(message="Instant availability updated")


# ── LOCATION ─────────────────────────────────────────────────────────
@router.post("/location", response_model=SuccessResponse)
async def update_location(
    body: WorkerLocationUpdate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    _, wp = user_and_wp

    geom = func.ST_SetSRID(func.ST_MakePoint(body.lon, body.lat), 4326)

    existing = await db.execute(
        select(WorkerLocation).where(WorkerLocation.worker_id == wp.id)
    )
    loc = existing.scalar_one_or_none()

    if loc:
        loc.lat = body.lat
        loc.lon = body.lon
        loc.accuracy_m = body.accuracy_m
        loc.heading = body.heading
        loc.geom = geom
        loc.updated_at = datetime.now(timezone.utc)
    else:
        db.add(WorkerLocation(
            worker_id=wp.id,
            lat=body.lat, lon=body.lon,
            accuracy_m=body.accuracy_m,
            heading=body.heading,
            geom=geom,
        ))
    await db.commit()
    return SuccessResponse(message="Location updated")


# ── DOCUMENTS ────────────────────────────────────────────────────────
@router.get("/documents", response_model=list[WorkerDocumentResponse])
async def get_my_documents(
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(WorkerDocument).where(WorkerDocument.worker_id == wp.id)
        .order_by(WorkerDocument.created_at)
    )
    return [WorkerDocumentResponse.model_validate(d) for d in result.scalars().all()]

@router.post("/documents", response_model=WorkerDocumentResponse)
async def upload_document(
    body: DocumentUpload,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    doc = WorkerDocument(
        worker_id=wp.id,
        type=body.type,
        cloudinary_url=body.cloudinary_url,  # stores Supabase URL
        cloudinary_id=body.cloudinary_id,    # stores Supabase path
        file_size_kb=body.file_size_kb,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return WorkerDocumentResponse.model_validate(doc)


# ── SERVICES ─────────────────────────────────────────────────────────
@router.get("/services", response_model=list[ServiceResponse])
async def get_my_services(
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Service).where(Service.worker_id == wp.id)
        .order_by(Service.created_at)
    )
    return [ServiceResponse.model_validate(s) for s in result.scalars().all()]

@router.post("/services", response_model=ServiceResponse)
async def create_service(
    body: ServiceCreate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    svc = Service(
        worker_id=wp.id,
        category_id=body.category_id,
        title=body.title,
        description=body.description,
        price=body.price,
        price_type=body.price_type,
        duration_min=body.duration_min,
    )
    db.add(svc)
    await db.commit()
    await db.refresh(svc)
    return ServiceResponse.model_validate(svc)

@router.patch("/services/{service_id}", response_model=ServiceResponse)
async def update_service(
    service_id: UUID,
    body: ServiceUpdate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404, "Service not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(svc, field, value)
    await db.commit()
    await db.refresh(svc)
    return ServiceResponse.model_validate(svc)

@router.delete("/services/{service_id}", response_model=SuccessResponse)
async def delete_service(
    service_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Service).where(Service.id == service_id, Service.worker_id == wp.id)
    )
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(404)
    await db.delete(svc)
    await db.commit()
    return SuccessResponse(message="Service deleted")


# ── PACKAGES ─────────────────────────────────────────────────────────
@router.get("/packages", response_model=list[PackageResponse])
async def get_my_packages(
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Package).where(Package.worker_id == wp.id)
        .order_by(Package.created_at.desc())
    )
    return [PackageResponse.model_validate(p) for p in result.scalars().all()]

@router.post("/packages", response_model=PackageResponse)
async def create_package(
    body: PackageCreate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    pkg = Package(
        worker_id=wp.id,
        title=body.title,
        description=body.description,
        original_price=body.original_price,
        discounted_price=body.discounted_price,
    )
    db.add(pkg)
    await db.flush()
    for svc_id in body.service_ids:
        db.add(PackageService(package_id=pkg.id, service_id=svc_id))
    await db.commit()
    await db.refresh(pkg)
    return PackageResponse.model_validate(pkg)

@router.patch("/packages/{package_id}", response_model=PackageResponse)
async def update_package(
    package_id: UUID,
    body: PackageUpdate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.worker_id == wp.id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(404)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pkg, field, value)
    await db.commit()
    await db.refresh(pkg)
    return PackageResponse.model_validate(pkg)

@router.delete("/packages/{package_id}", response_model=SuccessResponse)
async def delete_package(
    package_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Package).where(Package.id == package_id, Package.worker_id == wp.id)
    )
    pkg = result.scalar_one_or_none()
    if not pkg:
        raise HTTPException(404)
    await db.delete(pkg)
    await db.commit()
    return SuccessResponse(message="Package deleted")


# ── OFFERS ───────────────────────────────────────────────────────────
@router.get("/offers", response_model=list[OfferResponse])
async def get_my_offers(
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Offer).where(Offer.worker_id == wp.id)
        .order_by(Offer.created_at.desc())
    )
    return [OfferResponse.model_validate(o) for o in result.scalars().all()]

@router.post("/offers", response_model=OfferResponse)
async def create_offer(
    body: OfferCreate,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    offer = Offer(
        worker_id=wp.id,
        service_id=body.service_id,
        title=body.title,
        description=body.description,
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        min_order_value=body.min_order_value,
        promo_code=body.promo_code,
        valid_until=body.valid_until,
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return OfferResponse.model_validate(offer)

@router.delete("/offers/{offer_id}", response_model=SuccessResponse)
async def delete_offer(
    offer_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.worker_id == wp.id)
    )
    offer = result.scalar_one_or_none()
    if not offer:
        raise HTTPException(404)
    await db.delete(offer)
    await db.commit()
    return SuccessResponse(message="Offer deleted")


# ── MEDIA ────────────────────────────────────────────────────────────
@router.get("/media", response_model=list[MediaResponse])
async def get_my_media(
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(ServiceMedia)
        .where(ServiceMedia.worker_id == wp.id)
        .order_by(ServiceMedia.sort_order, ServiceMedia.created_at.desc())
    )
    return [MediaResponse.model_validate(m) for m in result.scalars().all()]

@router.patch("/media/{media_id}", response_model=MediaResponse)
async def update_media(
    media_id: UUID,
    body: dict,  # { sort_order?, is_featured?, caption? }
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(ServiceMedia).where(
            ServiceMedia.id == media_id,
            ServiceMedia.worker_id == wp.id,
        )
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(404)
    for field in ("sort_order", "is_featured", "caption"):
        if field in body:
            setattr(media, field, body[field])
    await db.commit()
    await db.refresh(media)
    return MediaResponse.model_validate(media)


# ── ANALYTICS ────────────────────────────────────────────────────────
@router.get("/analytics", response_model=WorkerAnalyticsResponse)
async def get_my_analytics(
    period: str = Query("month", pattern="^(today|week|month|all)$"),
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp

    result = await db.execute(
        select(WorkerAnalytics).where(WorkerAnalytics.worker_id == wp.id)
    )
    analytics = result.scalar_one_or_none()

    if not analytics:
        # Create if missing
        analytics = WorkerAnalytics(worker_id=wp.id)
        db.add(analytics)
        await db.commit()
        await db.refresh(analytics)

    return WorkerAnalyticsResponse.model_validate(analytics)


# ── JOBS (worker view) ───────────────────────────────────────────────
@router.get("/jobs", response_model=list)
async def get_my_jobs_as_worker(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    q = select(Job).where(Job.worker_id == wp.id).order_by(Job.created_at.desc())
    if status == "active":
        q = q.where(Job.status.in_(["assigned", "en_route", "arrived", "started"]))
    elif status == "completed":
        q = q.where(Job.status == "completed")
    q = q.offset((page - 1) * 20).limit(20)
    result = await db.execute(q)
    from schemas import JobResponse
    return [JobResponse.model_validate(j) for j in result.scalars().all()]


# ── EARNINGS ─────────────────────────────────────────────────────────
@router.get("/earnings")
async def get_my_earnings(
    period: str = Query("month", pattern="^(today|week|month|all)$"),
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(WorkerAnalytics).where(WorkerAnalytics.worker_id == wp.id)
    )
    analytics = result.scalar_one_or_none()
    if not analytics:
        return {"period": period, "earnings": 0, "jobs": 0}

    mapping = {
        "today": (analytics.today_earnings, analytics.today_jobs),
        "week": (analytics.week_earnings, analytics.week_jobs),
        "month": (analytics.month_earnings, analytics.month_jobs),
        "all": (analytics.total_earnings, analytics.total_jobs),
    }
    earnings, jobs = mapping[period]
    return {"period": period, "earnings": float(earnings), "jobs": jobs}


# ── PAYOUT DETAILS ───────────────────────────────────────────────────
@router.patch("/payout", response_model=SuccessResponse)
async def update_payout_details(
    body: dict,  # { payout_upi_id?, payout_bank_account?, payout_ifsc?, payout_account_name? }
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    allowed = ("payout_upi_id", "payout_bank_account", "payout_ifsc", "payout_account_name")
    for field in allowed:
        if field in body:
            setattr(wp, field, body[field])
    await db.commit()
    return SuccessResponse(message="Payout details updated")
```

---

## routers/workers_public.py

```python
"""
Public worker profile endpoints.
GET /v1/workers/{worker_id}
GET /v1/workers/{worker_id}/services
GET /v1/workers/{worker_id}/packages
GET /v1/workers/{worker_id}/media
GET /v1/workers/{worker_id}/reviews
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import WorkerProfile, User, Service, ServiceMedia, Package, Review
from schemas import (
    WorkerPublicResponse, ServiceResponse, PackageResponse,
    MediaResponse, ReviewResponse,
)

router = APIRouter()

async def _get_approved_worker(worker_id: UUID, db: AsyncSession):
    result = await db.execute(
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .where(
            WorkerProfile.id == worker_id,
            WorkerProfile.verification_status == "approved",
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(404, "Worker not found")
    return row

@router.get("/{worker_id}", response_model=WorkerPublicResponse)
async def get_worker_profile(
    worker_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    wp, user = await _get_approved_worker(worker_id, db)
    data = WorkerPublicResponse.model_validate(wp)
    data.full_name = user.full_name
    data.avatar_url = user.avatar_url
    return data

@router.get("/{worker_id}/services", response_model=list[ServiceResponse])
async def get_worker_services(
    worker_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Service)
        .where(Service.worker_id == worker_id, Service.is_active == True)
        .order_by(Service.avg_rating.desc())
    )
    return [ServiceResponse.model_validate(s) for s in result.scalars().all()]

@router.get("/{worker_id}/packages", response_model=list[PackageResponse])
async def get_worker_packages(
    worker_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Package)
        .where(Package.worker_id == worker_id, Package.is_active == True)
    )
    return [PackageResponse.model_validate(p) for p in result.scalars().all()]

@router.get("/{worker_id}/media", response_model=list[MediaResponse])
async def get_worker_media(
    worker_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ServiceMedia)
        .where(ServiceMedia.worker_id == worker_id)
        .order_by(ServiceMedia.is_featured.desc(), ServiceMedia.sort_order)
    )
    return [MediaResponse.model_validate(m) for m in result.scalars().all()]

@router.get("/{worker_id}/reviews", response_model=list[ReviewResponse])
async def get_worker_reviews(
    worker_id: UUID,
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Review)
        .where(Review.worker_id == worker_id, Review.is_visible == True)
        .order_by(Review.created_at.desc())
        .offset((page - 1) * 20).limit(20)
    )
    return [ReviewResponse.model_validate(r) for r in result.scalars().all()]
```

---

## routers/jobs.py  (user job creation + user actions)

```python
"""
POST  /v1/jobs
GET   /v1/jobs/me
GET   /v1/jobs/{id}
POST  /v1/jobs/{id}/cancel
POST  /v1/jobs/{id}/sos
GET   /v1/jobs/{id}/worker-location
"""
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database import get_db
from models import User, Job, WorkerProfile, WorkerLocation, JobEvent, SOSEvent, Chat
from schemas import JobCreate, JobResponse, JobCancel, SuccessResponse
from dependencies import get_current_user

router = APIRouter()

def _geom(lon, lat):
    return func.ST_SetSRID(func.ST_MakePoint(float(lon), float(lat)), 4326)

@router.post("", response_model=JobResponse)
async def create_job(
    body: JobCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = Job(
        user_id=user.id,
        category_id=body.category_id,
        job_type=body.job_type,
        title=body.title,
        description=body.description,
        location_lat=body.location_lat,
        location_lon=body.location_lon,
        location_address=body.location_address,
        location_area=body.location_area,
        location_note=body.location_note,
        location_geom=_geom(body.location_lon, body.location_lat),
        service_id=body.service_id,
        package_id=body.package_id,
        scheduled_at=body.scheduled_at,
        quoted_price=body.quoted_price,
        job_photos=body.photos,
        status="requested",
    )
    db.add(job)
    await db.flush()
    db.add(JobEvent(
        job_id=job.id, status="requested",
        actor="user", actor_id=user.id,
    ))
    await db.commit()
    await db.refresh(job)

    if body.job_type == "instant":
        from services.matching import dispatch_job
        background_tasks.add_task(dispatch_job, str(job.id))

    return JobResponse.model_validate(job)

@router.get("/me", response_model=list[JobResponse])
async def get_my_jobs(
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(Job).where(Job.user_id == user.id).order_by(Job.created_at.desc())
    if status == "active":
        q = q.where(Job.status.in_(["requested","searching","assigned","en_route","arrived","started"]))
    elif status == "past":
        q = q.where(Job.status.in_(["completed","cancelled","failed"]))
    result = await db.execute(q.offset((page - 1) * 20).limit(20))
    return [JobResponse.model_validate(j) for j in result.scalars().all()]

@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)

    # Access check: user or assigned worker or admin
    has_access = (user.id == job.user_id) or (user.role == "admin")
    if not has_access and job.worker_id:
        wp = (await db.execute(
            select(WorkerProfile).where(WorkerProfile.id == job.worker_id)
        )).scalar_one_or_none()
        if wp and wp.user_id == user.id:
            has_access = True
    if not has_access:
        raise HTTPException(403)

    return JobResponse.model_validate(job)

@router.post("/{job_id}/cancel", response_model=SuccessResponse)
async def cancel_job(
    job_id: UUID,
    body: JobCancel,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.user_id == user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)
    if job.status in ("completed", "cancelled", "failed"):
        raise HTTPException(400, "Cannot cancel")

    job.status = "cancelled"
    job.cancelled_at = datetime.now(timezone.utc)
    job.cancellation_reason = body.reason
    job.cancelled_by = "user"

    db.add(JobEvent(
        job_id=job.id, status="cancelled",
        actor="user", actor_id=user.id,
        metadata={"reason": body.reason},
    ))
    await db.commit()
    return SuccessResponse(message="Job cancelled")

@router.post("/{job_id}/sos", response_model=SuccessResponse)
async def trigger_sos(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)

    db.add(SOSEvent(
        job_id=job.id,
        triggered_by=user.id,
        triggered_by_role="user",
    ))
    await db.commit()
    return SuccessResponse(message="SOS triggered. Help is on the way.")

@router.get("/{job_id}/worker-location")
async def get_worker_location(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job or job.worker_id is None:
        return {"lat": None, "lon": None}

    loc = (await db.execute(
        select(WorkerLocation).where(WorkerLocation.worker_id == job.worker_id)
    )).scalar_one_or_none()

    if not loc:
        return {"lat": None, "lon": None}
    return {"lat": float(loc.lat), "lon": float(loc.lon), "updated_at": loc.updated_at}
```

---

## routers/jobs_worker.py  (worker job action endpoints)

```python
"""
POST /v1/jobs/{id}/accept
POST /v1/jobs/{id}/reject
POST /v1/jobs/{id}/arrived
POST /v1/jobs/{id}/start
POST /v1/jobs/{id}/complete
"""
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, Job, WorkerProfile, JobEvent, JobWorkerRequest
from schemas import JobCancel, SuccessResponse
from dependencies import get_current_worker

router = APIRouter()

@router.post("/{job_id}/accept", response_model=SuccessResponse)
async def accept_job(
    job_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    from services.matching import handle_worker_accept
    await handle_worker_accept(db, str(job_id), str(wp.id))
    return SuccessResponse(message="Job accepted")

@router.post("/{job_id}/reject", response_model=SuccessResponse)
async def reject_job(
    job_id: UUID,
    body: JobCancel,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    from services.matching import handle_worker_reject
    await handle_worker_reject(db, str(wp.id), str(job_id), body.reason)
    return SuccessResponse(message="Job declined")

@router.post("/{job_id}/arrived", response_model=SuccessResponse)
async def mark_arrived(
    job_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    return await _transition(db, job_id, user_and_wp, "arrived", "arrived_at")

@router.post("/{job_id}/start", response_model=SuccessResponse)
async def start_job(
    job_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    return await _transition(db, job_id, user_and_wp, "started", "started_at")

@router.post("/{job_id}/complete", response_model=SuccessResponse)
async def complete_job(
    job_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    return await _transition(db, job_id, user_and_wp, "completed", "completed_at")

async def _transition(db, job_id, user_and_wp, new_status, time_field):
    user, wp = user_and_wp
    result = await db.execute(
        select(Job).where(Job.id == job_id, Job.worker_id == wp.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found or not assigned to you")

    job.status = new_status
    setattr(job, time_field, datetime.now(timezone.utc))
    db.add(JobEvent(
        job_id=job.id,
        status=new_status,
        actor="worker",
        actor_id=user.id,
    ))
    await db.commit()
    return SuccessResponse(message=f"Job {new_status}")
```

---

## routers/upload.py

```python
"""
POST   /v1/upload/profile-photo    → profile_photos bucket
POST   /v1/upload/worker-post      → worker_posts bucket
DELETE /v1/upload/worker-post/{media_id}
"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import User, WorkerProfile, ServiceMedia
from schemas import MediaUploadResponse, SuccessResponse
from dependencies import get_current_user, get_current_worker
from services.storage import (
    upload_file, delete_file,
    profile_photo_path, worker_post_path,
    BUCKET_PROFILE, BUCKET_POSTS,
)

router = APIRouter()

ALLOWED_IMAGES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEOS = {"video/mp4", "video/quicktime", "video/webm"}
MAX_IMAGE = 10 * 1024 * 1024   # 10 MB
MAX_VIDEO = 100 * 1024 * 1024  # 100 MB

@router.post("/profile-photo", response_model=MediaUploadResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGES:
        raise HTTPException(400, "Only JPEG/PNG/WebP images allowed")

    data = await file.read()
    if len(data) > MAX_IMAGE:
        raise HTTPException(400, "Image must be under 10MB")

    path = profile_photo_path(str(user.id))
    url = upload_file(BUCKET_PROFILE, path, data, file.content_type)

    user.avatar_url = url
    await db.commit()

    return MediaUploadResponse(url=url, path=path, bucket=BUCKET_PROFILE)

@router.post("/worker-post", response_model=MediaUploadResponse)
async def upload_worker_post(
    file: UploadFile = File(...),
    service_id: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    is_featured: bool = Form(False),
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    user, wp = user_and_wp
    is_video = file.content_type in ALLOWED_VIDEOS
    is_image = file.content_type in ALLOWED_IMAGES

    if not is_video and not is_image:
        raise HTTPException(400, "Only images (JPEG/PNG/WebP) or videos (MP4/MOV/WebM) allowed")

    data = await file.read()
    if len(data) > (MAX_VIDEO if is_video else MAX_IMAGE):
        raise HTTPException(400, f"File too large (max {'100MB' if is_video else '10MB'})")

    path = worker_post_path(str(user.id), file.filename or "upload")
    url = upload_file(BUCKET_POSTS, path, data, file.content_type)

    import uuid as _uuid
    media = ServiceMedia(
        worker_id=wp.id,
        service_id=_uuid.UUID(service_id) if service_id else None,
        type="video" if is_video else "image",
        cloudinary_url=url,   # column name kept from schema; stores Supabase URL
        cloudinary_id=path,   # stores Supabase path for deletion
        caption=caption,
        is_featured=is_featured,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)

    return MediaUploadResponse(
        url=url, path=path, bucket=BUCKET_POSTS,
        media_id=str(media.id),
        media_type="video" if is_video else "image",
    )

@router.delete("/worker-post/{media_id}", response_model=SuccessResponse)
async def delete_worker_post(
    media_id: UUID,
    user_and_wp=Depends(get_current_worker),
    db: AsyncSession = Depends(get_db),
):
    _, wp = user_and_wp
    result = await db.execute(
        select(ServiceMedia).where(
            ServiceMedia.id == media_id,
            ServiceMedia.worker_id == wp.id,
        )
    )
    media = result.scalar_one_or_none()
    if not media:
        raise HTTPException(404, "Media not found")

    delete_file(BUCKET_POSTS, media.cloudinary_id)
    await db.delete(media)
    await db.commit()
    return SuccessResponse(message="Deleted")
```

---

## services/storage.py

```python
"""Supabase Storage service for profile_photos and worker_posts buckets."""
import time, uuid
from supabase import create_client
from config import get_settings

settings = get_settings()
_supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

BUCKET_PROFILE = "profile_photos"
BUCKET_POSTS   = "worker_posts"

def get_public_url(bucket: str, path: str) -> str:
    return f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"

def upload_file(bucket: str, path: str, data: bytes, content_type: str) -> str:
    _supabase.storage.from_(bucket).upload(
        path=path,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return get_public_url(bucket, path)

def delete_file(bucket: str, path: str) -> None:
    try:
        _supabase.storage.from_(bucket).remove([path])
    except Exception:
        pass  # File may already be gone

def profile_photo_path(user_id: str, filename: str = "avatar.jpg") -> str:
    return f"{user_id}/{filename}"

def worker_post_path(user_id: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    return f"{user_id}/{int(time.time())}_{uuid.uuid4().hex[:8]}.{ext}"
```

---

## services/matching.py

```python
"""
Uber-style expanding radius matching engine.
Runs as FastAPI BackgroundTask after instant job creation.
"""
import asyncio, math
from datetime import datetime, timedelta, timezone
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text
from database import async_session
from models import (
    Job, WorkerProfile, JobWorkerRequest, JobEvent,
    Chat, Notification, PlatformConfig,
)

async def dispatch_job(job_id: str):
    async with async_session() as db:
        config = await _get_config(db)
        radius      = float(config.get("matching_initial_radius_km", "2"))
        max_radius  = float(config.get("matching_max_radius_km", "5"))
        step        = float(config.get("matching_radius_step_km", "1"))
        timeout     = int(config.get("matching_request_timeout_sec", "10"))
        max_workers = int(config.get("max_workers_per_dispatch", "5"))

        result = await db.execute(select(Job).where(Job.id == UUID(job_id)))
        job = result.scalar_one_or_none()
        if not job:
            return

        job.status = "searching"
        db.add(JobEvent(job_id=job.id, status="searching", actor="system", actor_id=job.user_id))
        await db.commit()

        while radius <= max_radius:
            workers = await _find_workers(db, job, radius)

            if workers:
                ranked = _rank_workers(workers)[:max_workers]
                expires = datetime.now(timezone.utc) + timedelta(seconds=timeout)

                req_ids = []
                for w in ranked:
                    req = JobWorkerRequest(
                        job_id=job.id,
                        worker_id=w["worker_id"],
                        radius_km=radius,
                        distance_km=w["distance_km"],
                        score_at_dispatch=w["score"],
                        expires_at=expires,
                    )
                    db.add(req)
                    await db.flush()
                    req_ids.append(req.id)

                    # Notify worker via in-app notification (Supabase Realtime picks this up)
                    db.add(Notification(
                        user_id=w["user_id"],
                        type="job_request",
                        title=f"New job near you",
                        body=f"{w['distance_km']:.1f}km away • Tap to view",
                        data={"job_id": str(job.id), "request_id": str(req.id)},
                    ))

                job.workers_notified = (job.workers_notified or 0) + len(ranked)
                job.dispatch_rounds = (job.dispatch_rounds or 0) + 1
                await db.commit()

                winner = await _poll_acceptance(db, job.id, req_ids, timeout)

                if winner:
                    await _assign_job(db, job, winner)
                    return  # SUCCESS

                # No acceptance — expire requests, expand radius
                await db.execute(
                    update(JobWorkerRequest)
                    .where(
                        JobWorkerRequest.job_id == job.id,
                        JobWorkerRequest.status == "pending",
                    )
                    .values(status="expired")
                )
                await db.commit()

            radius += step

        # Failed — no match in any radius
        result = await db.execute(select(Job).where(Job.id == UUID(job_id)))
        job = result.scalar_one_or_none()
        if job:
            job.status = "failed"
            db.add(JobEvent(
                job_id=job.id, status="failed",
                actor="system", actor_id=job.user_id,
            ))
            db.add(Notification(
                user_id=job.user_id,
                type="job_failed",
                title="No workers available",
                body="All nearby workers are busy. Try again in a few minutes.",
            ))
            await db.commit()


async def _find_workers(db: AsyncSession, job: Job, radius_km: float) -> list[dict]:
    sql = text("""
        SELECT
            wp.id AS worker_id,
            u.id AS user_id,
            u.full_name,
            u.avatar_url,
            wp.avg_rating,
            wp.acceptance_rate,
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
        JOIN worker_categories wc ON wc.worker_id = wp.id AND wc.category_id = :cat_id
        WHERE
            wp.status = 'online'
            AND wp.verification_status = 'approved'
            AND wp.is_instant_available = true
            AND (wp.auto_offline_until IS NULL OR wp.auto_offline_until < NOW())
            AND wl.updated_at > NOW() - INTERVAL '2 minutes'
            AND wp.id NOT IN (
                SELECT worker_id FROM job_worker_requests
                WHERE job_id = :job_id
            )
            AND ST_DWithin(
                wl.geom::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                :radius_m
            )
        ORDER BY distance_km ASC
        LIMIT 10
    """)
    result = await db.execute(sql, {
        "lon": float(job.location_lon),
        "lat": float(job.location_lat),
        "cat_id": str(job.category_id),
        "job_id": str(job.id),
        "radius_m": radius_km * 1000,
    })
    return [dict(r._mapping) for r in result.all()]


def _rank_workers(workers: list[dict]) -> list[dict]:
    for w in workers:
        dist_score       = max(0, 1.0 - (float(w["distance_km"]) / 5.0))
        rating_score     = float(w["avg_rating"]) / 5.0
        accept_score     = float(w["acceptance_rate"])
        completion_score = min(math.log10(max(w["total_jobs_completed"], 1)) / 2.0, 1.0)
        response_score   = max(0, 1.0 - (w["avg_response_time_sec"] / 300.0))

        base = (
            0.30 * dist_score +
            0.20 * rating_score +
            0.15 * accept_score +
            0.15 * completion_score +
            0.10 * response_score +
            0.10 * 1.0  # price placeholder
        )
        w["score"] = round(base * float(w["cancellation_score"]), 4)

    return sorted(workers, key=lambda x: x["score"], reverse=True)


async def _poll_acceptance(db, job_id, req_ids, timeout_sec):
    for _ in range(timeout_sec * 2):  # check every 500ms
        result = await db.execute(
            select(JobWorkerRequest).where(
                JobWorkerRequest.job_id == job_id,
                JobWorkerRequest.status == "accepted",
            )
        )
        winner = result.scalar_one_or_none()
        if winner:
            return winner
        await asyncio.sleep(0.5)
    return None


async def _assign_job(db, job, winner: JobWorkerRequest):
    result = await db.execute(select(Job).where(Job.id == job.id))
    job = result.scalar_one_or_none()
    if not job:
        return

    job.status = "assigned"
    job.worker_id = winner.worker_id
    job.assigned_at = datetime.now(timezone.utc)
    job.search_radius_km = winner.radius_km

    # Set worker to busy
    await db.execute(
        update(WorkerProfile)
        .where(WorkerProfile.id == winner.worker_id)
        .values(status="busy", consecutive_rejects=0)
    )

    # Cancel other pending requests for this job
    await db.execute(
        update(JobWorkerRequest)
        .where(
            JobWorkerRequest.job_id == job.id,
            JobWorkerRequest.id != winner.id,
            JobWorkerRequest.status == "pending",
        )
        .values(status="cancelled")
    )

    # Create chat
    db.add(Chat(job_id=job.id, user_id=job.user_id, worker_id=winner.worker_id))

    # Audit event
    db.add(JobEvent(
        job_id=job.id, status="assigned",
        actor="system", actor_id=job.user_id,
    ))

    # Notify customer
    db.add(Notification(
        user_id=job.user_id,
        type="job_assigned",
        title="Worker found! 🎉",
        body="Your worker is on the way.",
        data={"job_id": str(job.id)},
    ))

    await db.commit()


async def handle_worker_accept(db: AsyncSession, job_id: str, worker_id: str):
    """Called from jobs_worker.py when worker taps Accept."""
    result = await db.execute(
        select(JobWorkerRequest).where(
            JobWorkerRequest.job_id == UUID(job_id),
            JobWorkerRequest.worker_id == UUID(worker_id),
            JobWorkerRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        return
    req.status = "accepted"
    req.responded_at = datetime.now(timezone.utc)

    # Update avg response time
    response_secs = (req.responded_at - req.notified_at).total_seconds()
    await db.execute(
        update(WorkerProfile)
        .where(WorkerProfile.id == UUID(worker_id))
        .values(
            consecutive_rejects=0,
            avg_response_time_sec=int(response_secs),  # simplified; use rolling avg in prod
        )
    )
    await db.commit()


async def handle_worker_reject(
    db: AsyncSession, worker_id: str, job_id: str, reason: str = ""
):
    """Called from jobs_worker.py when worker taps Decline."""
    result = await db.execute(
        select(JobWorkerRequest).where(
            JobWorkerRequest.job_id == UUID(job_id),
            JobWorkerRequest.worker_id == UUID(worker_id),
            JobWorkerRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if req:
        req.status = "rejected"
        req.responded_at = datetime.now(timezone.utc)
        req.rejection_reason = reason

    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == UUID(worker_id))
    )
    wp = wp_result.scalar_one_or_none()
    if not wp:
        await db.commit()
        return

    config = await _get_config(db)
    threshold = int(config.get("auto_offline_reject_threshold", "5"))
    duration  = int(config.get("auto_offline_duration_min", "5"))

    new_rejects = wp.consecutive_rejects + 1
    if new_rejects >= threshold:
        wp.consecutive_rejects = 0
        wp.auto_offline_until = datetime.now(timezone.utc) + timedelta(minutes=duration)
        # Notify worker
        db.add(Notification(
            user_id=wp.user_id,
            type="auto_offline",
            title="Temporarily set offline",
            body=f"You've been offline for {duration} min due to multiple rejections.",
        ))
    else:
        wp.consecutive_rejects = new_rejects

    await db.commit()


async def _get_config(db: AsyncSession) -> dict:
    result = await db.execute(select(PlatformConfig))
    return {c.key: c.value for c in result.scalars().all()}
```

---

## tasks/scheduler.py

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = AsyncIOScheduler()

def start_scheduler():
    from tasks.escrow_release import release_due_escrows
    from tasks.decay_scores import recover_cancellation_scores

    scheduler.add_job(
        release_due_escrows,
        trigger=IntervalTrigger(minutes=15),
        id="escrow_release",
        replace_existing=True,
    )
    scheduler.add_job(
        recover_cancellation_scores,
        trigger=IntervalTrigger(hours=24),
        id="decay_scores",
        replace_existing=True,
    )
    scheduler.start()

def stop_scheduler():
    scheduler.shutdown()
```

---

## tasks/escrow_release.py

```python
from datetime import datetime, timezone
from database import async_session
from models import Payment, Payout, WorkerProfile
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

async def release_due_escrows():
    async with async_session() as db:
        result = await db.execute(
            select(Payment).where(
                Payment.status == "held",
                Payment.escrow_release_due_at <= datetime.now(timezone.utc),
            )
        )
        payments = result.scalars().all()

        for payment in payments:
            # Check no open dispute
            # (simplified: check support_tickets table in production)
            payment.status = "released"
            payment.escrow_released_at = datetime.now(timezone.utc)

            # Get job to find commission data
            from models import Job
            job = (await db.execute(
                select(Job).where(Job.id == payment.job_id)
            )).scalar_one_or_none()

            if job and job.worker_payout and job.worker_id:
                payout = Payout(
                    worker_id=job.worker_id,
                    payment_id=payment.id,
                    job_id=job.id,
                    gross_amount=payment.amount,
                    platform_fee=job.platform_fee or 0,
                    gst_on_fee=job.gst_on_fee or 0,
                    net_amount=job.worker_payout,
                )
                db.add(payout)

                # Update worker pending_payout
                wp = (await db.execute(
                    select(WorkerProfile).where(WorkerProfile.id == job.worker_id)
                )).scalar_one_or_none()
                if wp:
                    wp.pending_payout = max(0, float(wp.pending_payout) - float(job.worker_payout))

            await db.commit()
```

---

## tasks/decay_scores.py

```python
from database import async_session
from models import WorkerProfile
from sqlalchemy import select, update

async def recover_cancellation_scores():
    """Daily: slightly recover cancellation scores for active workers."""
    async with async_session() as db:
        await db.execute(
            update(WorkerProfile)
            .where(
                WorkerProfile.cancellation_score < 1.0,
                WorkerProfile.total_jobs_completed > 0,
                WorkerProfile.verification_status == "approved",
            )
            .values(
                cancellation_score=WorkerProfile.cancellation_score + 0.02
            )
        )
        await db.commit()
```

---

## routers/categories.py

```python
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Category, PuneArea
from schemas import CategoryResponse, PuneAreaResponse

router = APIRouter()

@router.get("", response_model=list[CategoryResponse])
async def list_categories(
    mode: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = select(Category).where(Category.is_active == True).order_by(Category.sort_order)
    if mode == "instant":
        q = q.where(Category.mode.in_(["instant", "both"]))
    elif mode == "discovery":
        q = q.where(Category.mode.in_(["discovery", "both"]))
    result = await db.execute(q)
    return [CategoryResponse.model_validate(c) for c in result.scalars().all()]

@router.get("/areas", response_model=list[PuneAreaResponse])
async def list_areas(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PuneArea).where(PuneArea.is_active == True).order_by(PuneArea.name)
    )
    return [PuneAreaResponse.model_validate(a) for a in result.scalars().all()]
```

---

## routers/chat.py

```python
import re
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from datetime import datetime, timezone
from database import get_db
from models import User, Chat, Message, WorkerProfile, Job
from schemas import MessageCreate, MessageResponse, ChatResponse, SuccessResponse
from dependencies import get_current_user

router = APIRouter()

# Phone masking patterns
_PHONE = re.compile(r'(?:\+91|0091|91)?[\s\-]?[6-9]\d{9}')
_EMAIL = re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}')
_WHATSAPP = re.compile(r'whatsapp\s*[\:\-]?\s*[\d\s\+\-]+', re.IGNORECASE)
_INSTA = re.compile(r'insta(?:gram)?\s*[\:\-]?\s*@?\w+', re.IGNORECASE)
_TELEGRAM = re.compile(r'telegram\s*[\:\-]?\s*@?\w+', re.IGNORECASE)

def _sanitize(text: str) -> str:
    text = _PHONE.sub('📵 [Number Hidden]', text)
    text = _EMAIL.sub('📧 [Email Hidden]', text)
    text = _WHATSAPP.sub('💬 [Contact Hidden]', text)
    text = _INSTA.sub('💬 [Contact Hidden]', text)
    text = _TELEGRAM.sub('💬 [Contact Hidden]', text)
    return text

@router.get("/{job_id}", response_model=ChatResponse)
async def get_chat(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Chat).where(Chat.job_id == job_id))
    chat = result.scalar_one_or_none()
    if not chat:
        raise HTTPException(404, "Chat not found")
    return ChatResponse.model_validate(chat)

@router.get("/{job_id}/messages", response_model=list[MessageResponse])
async def get_messages(
    job_id: UUID,
    page: int = Query(1, ge=1),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat_result = await db.execute(select(Chat).where(Chat.job_id == job_id))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(404)

    result = await db.execute(
        select(Message)
        .where(Message.chat_id == chat.id, Message.is_deleted == False)
        .order_by(Message.created_at)
        .offset((page - 1) * 50).limit(50)
    )
    # NEVER return raw_content — use content (sanitized) field only
    return [MessageResponse.model_validate(m) for m in result.scalars().all()]

@router.post("/{job_id}/messages", response_model=MessageResponse)
async def send_message(
    job_id: UUID,
    body: MessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify chat exists and job is in valid state
    chat_result = await db.execute(select(Chat).where(Chat.job_id == job_id))
    chat = chat_result.scalar_one_or_none()
    if not chat or not chat.is_active:
        raise HTTPException(403, "Chat not available")

    job_result = await db.execute(select(Job).where(Job.id == job_id))
    job = job_result.scalar_one_or_none()
    if not job or job.status not in ("assigned","en_route","arrived","started","completed"):
        raise HTTPException(403, "Chat only available after job is assigned")

    # Determine sender role
    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.user_id == user.id)
    )
    wp = wp_result.scalar_one_or_none()
    role = "worker" if (wp and chat.worker_id == wp.id) else "user"

    raw = body.content
    sanitized = _sanitize(raw)

    msg = Message(
        chat_id=chat.id,
        sender_id=user.id,
        sender_role=role,
        raw_content=raw,       # stored, NEVER returned
        content=sanitized,     # always returned
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return MessageResponse.model_validate(msg)

@router.patch("/{job_id}/read", response_model=SuccessResponse)
async def mark_read(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    chat_result = await db.execute(select(Chat).where(Chat.job_id == job_id))
    chat = chat_result.scalar_one_or_none()
    if not chat:
        raise HTTPException(404)

    await db.execute(
        update(Message)
        .where(
            Message.chat_id == chat.id,
            Message.sender_id != user.id,
            Message.is_read == False,
        )
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return SuccessResponse(message="Messages marked as read")
```

---

## routers/payments.py

```python
import hmac, hashlib, json
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone, timedelta
from database import get_db
from models import User, Job, Payment
from schemas import PaymentOrderCreate, PaymentOrderResponse, PaymentResponse, SuccessResponse
from dependencies import get_current_user
from config import get_settings

settings = get_settings()
router = APIRouter()

def _commission(job_type: str, amount: float) -> dict:
    if job_type == "instant":
        rate = 0.15
    else:
        rate = round(0.10 + 0.05 * min(amount / 50_000, 1.0), 4)
    fee = round(amount * rate, 2)
    gst = round(fee * 0.18, 2)
    payout = round(amount - fee - gst, 2)
    return {"rate": rate, "fee": fee, "gst": gst, "payout": payout}

@router.post("/create-order", response_model=PaymentOrderResponse)
async def create_order(
    body: PaymentOrderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job = (await db.execute(
        select(Job).where(Job.id == body.job_id, Job.user_id == user.id)
    )).scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    if not job.quoted_price:
        raise HTTPException(400, "No price set on job")

    import razorpay
    rp = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    amount_paise = int(float(job.quoted_price) * 100)

    order = rp.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": str(job.id)[:40],
    })

    # Compute and store commission
    fin = _commission(job.job_type, float(job.quoted_price))
    job.commission_rate = fin["rate"]
    job.platform_fee = fin["fee"]
    job.gst_on_fee = fin["gst"]
    job.worker_payout = fin["payout"]

    payment = Payment(
        job_id=job.id,
        user_id=user.id,
        amount=job.quoted_price,
        razorpay_order_id=order["id"],
        status="order_created",
    )
    db.add(payment)
    await db.commit()

    return PaymentOrderResponse(
        razorpay_order_id=order["id"],
        amount=amount_paise,
        currency="INR",
        key_id=settings.razorpay_key_id,
    )

@router.post("/webhook")
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    body = await request.body()
    sig = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(
        settings.razorpay_webhook_secret.encode(), body, hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(sig, expected):
        raise HTTPException(400, "Invalid signature")

    data = json.loads(body)
    event = data.get("event", "")

    if event == "payment.captured":
        entity = data["payload"]["payment"]["entity"]
        order_id = entity["order_id"]

        payment = (await db.execute(
            select(Payment).where(Payment.razorpay_order_id == order_id)
        )).scalar_one_or_none()

        if payment:
            payment.status = "held"
            payment.razorpay_payment_id = entity["id"]
            payment.payment_method = entity.get("method", "")
            payment.held_at = datetime.now(timezone.utc)
            payment.escrow_release_due_at = datetime.now(timezone.utc) + timedelta(hours=2)
            payment.last_webhook_event = event
            payment.last_webhook_at = datetime.now(timezone.utc)
            await db.commit()

    return {"status": "ok"}

@router.get("/{job_id}", response_model=PaymentResponse)
async def get_payment(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    payment = (await db.execute(
        select(Payment).where(Payment.job_id == job_id)
    )).scalar_one_or_none()
    if not payment:
        raise HTTPException(404)
    return PaymentResponse.model_validate(payment)
```

---

## routers/admin.py

```python
"""
All admin-only endpoints.
GET  /v1/admin/dashboard/live
GET  /v1/admin/workers/pending
POST /v1/admin/workers/{id}/approve
POST /v1/admin/workers/{id}/reject
GET  /v1/admin/workers
GET  /v1/admin/jobs
GET  /v1/admin/support/tickets
PATCH /v1/admin/support/{id}
POST /v1/admin/support/{id}/messages
POST /v1/admin/payments/{id}/refund
GET  /v1/admin/config
PATCH /v1/admin/config
GET  /v1/admin/sos/active
"""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from datetime import datetime, timezone
from database import get_db
from models import (
    User, Job, WorkerProfile, WorkerDocument, Payment, Payout,
    SupportTicket, SupportMessage, SOSEvent, PlatformConfig, Notification
)
from schemas import AdminDashboard, AdminWorkerAction, AdminConfigUpdate, SuccessResponse
from dependencies import require_admin

router = APIRouter()

@router.get("/dashboard/live", response_model=AdminDashboard)
async def live_dashboard(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    active_jobs = (await db.execute(
        select(func.count()).select_from(Job).where(
            Job.status.in_(["searching","assigned","en_route","arrived","started"])
        )
    )).scalar() or 0

    online_workers = (await db.execute(
        select(func.count()).select_from(WorkerProfile).where(
            WorkerProfile.status == "online",
            WorkerProfile.verification_status == "approved",
        )
    )).scalar() or 0

    searching = (await db.execute(
        select(func.count()).select_from(Job).where(Job.status == "searching")
    )).scalar() or 0

    # Today revenue: sum of held+released payments today
    from datetime import date
    from sqlalchemy import cast, Date
    today_revenue = (await db.execute(
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(
            Payment.status.in_(["held", "released"]),
            cast(Payment.created_at, Date) == date.today(),
        )
    )).scalar() or 0

    total_jobs_today = (await db.execute(
        select(func.count()).select_from(Job).where(
            cast(Job.created_at, Date) == date.today()
        )
    )).scalar() or 1

    completed_today = (await db.execute(
        select(func.count()).select_from(Job).where(
            cast(Job.created_at, Date) == date.today(),
            Job.status.in_(["completed", "assigned", "en_route", "arrived", "started"]),
        )
    )).scalar() or 0

    fill_rate = round(completed_today / total_jobs_today * 100, 1)

    return AdminDashboard(
        active_jobs=active_jobs,
        online_workers=online_workers,
        today_revenue=today_revenue,
        fill_rate=fill_rate,
        searching_jobs=searching,
    )

@router.get("/workers/pending")
async def pending_workers(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProfile, User)
        .join(User, User.id == WorkerProfile.user_id)
        .where(WorkerProfile.verification_status.in_(["pending", "in_review"]))
        .order_by(WorkerProfile.created_at)
    )
    out = []
    for wp, u in result.all():
        # Get their documents
        docs_result = await db.execute(
            select(WorkerDocument).where(WorkerDocument.worker_id == wp.id)
        )
        docs = [{"type": d.type, "url": d.cloudinary_url, "status": d.status, "id": str(d.id)} 
                for d in docs_result.scalars().all()]
        out.append({
            "id": str(wp.id),
            "user_id": str(u.id),
            "full_name": u.full_name,
            "email": u.email,
            "phone": u.phone,
            "verification_status": wp.verification_status,
            "pune_area": wp.pune_area,
            "bio": wp.bio,
            "created_at": wp.created_at.isoformat(),
            "documents": docs,
        })
    return out

@router.post("/workers/{worker_id}/approve", response_model=SuccessResponse)
async def approve_worker(
    worker_id: UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == worker_id)
    )).scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    wp.verification_status = "approved"
    wp.verified_at = datetime.now(timezone.utc)

    db.add(Notification(
        user_id=wp.user_id,
        type="verification_approved",
        title="You're approved! 🎉",
        body="Welcome to Kaargar! Go online and start accepting jobs.",
    ))
    await db.commit()
    return SuccessResponse(message="Worker approved")

@router.post("/workers/{worker_id}/reject", response_model=SuccessResponse)
async def reject_worker(
    worker_id: UUID,
    body: AdminWorkerAction,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == worker_id)
    )).scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    wp.verification_status = "rejected"
    wp.rejection_reason = body.reason

    db.add(Notification(
        user_id=wp.user_id,
        type="verification_rejected",
        title="Verification update",
        body=f"Action required: {body.reason or 'Please re-upload your documents.'}",
    ))
    await db.commit()
    return SuccessResponse(message="Worker rejected")

@router.post("/workers/{worker_id}/suspend", response_model=SuccessResponse)
async def suspend_worker(
    worker_id: UUID,
    body: AdminWorkerAction,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    wp = (await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == worker_id)
    )).scalar_one_or_none()
    if not wp:
        raise HTTPException(404)
    wp.verification_status = "suspended"
    wp.status = "offline"
    wp.rejection_reason = body.reason
    await db.commit()
    return SuccessResponse(message="Worker suspended")

@router.get("/jobs")
async def list_jobs(
    status: str | None = Query(None),
    category: str | None = Query(None),
    job_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Job).order_by(Job.created_at.desc())
    if status:
        q = q.where(Job.status == status)
    if job_type:
        q = q.where(Job.job_type == job_type)
    result = await db.execute(q.offset((page - 1) * 30).limit(30))
    from schemas import JobResponse
    return [JobResponse.model_validate(j) for j in result.scalars().all()]

@router.get("/support/tickets")
async def list_support_tickets(
    status: str | None = Query(None),
    priority: str | None = Query(None),
    page: int = Query(1, ge=1),
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(SupportTicket).order_by(SupportTicket.created_at.desc())
    if status:
        q = q.where(SupportTicket.status == status)
    if priority:
        q = q.where(SupportTicket.priority == priority)
    result = await db.execute(q.offset((page - 1) * 30).limit(30))
    from schemas import TicketResponse
    return [TicketResponse.model_validate(t) for t in result.scalars().all()]

@router.patch("/support/{ticket_id}", response_model=SuccessResponse)
async def update_ticket(
    ticket_id: UUID,
    body: dict,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    ticket = (await db.execute(
        select(SupportTicket).where(SupportTicket.id == ticket_id)
    )).scalar_one_or_none()
    if not ticket:
        raise HTTPException(404)
    allowed = ("status", "priority", "resolution", "assigned_to", "refund_status")
    for field in allowed:
        if field in body:
            setattr(ticket, field, body[field])
    if body.get("status") in ("resolved", "closed"):
        ticket.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    return SuccessResponse(message="Ticket updated")

@router.post("/support/{ticket_id}/messages", response_model=SuccessResponse)
async def admin_reply_ticket(
    ticket_id: UUID,
    body: dict,  # { content: str }
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    db.add(SupportMessage(
        ticket_id=ticket_id,
        sender_id=user.id,
        sender_role="admin",
        content=body.get("content", ""),
    ))
    await db.commit()
    return SuccessResponse(message="Reply sent")

@router.post("/payments/{payment_id}/refund", response_model=SuccessResponse)
async def refund_payment(
    payment_id: UUID,
    body: dict,  # { amount: float, reason: str }
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    payment = (await db.execute(
        select(Payment).where(Payment.id == payment_id)
    )).scalar_one_or_none()
    if not payment:
        raise HTTPException(404)
    payment.status = "refunded"
    payment.refunded_at = datetime.now(timezone.utc)
    payment.refund_amount = body.get("amount", payment.amount)
    payment.refund_reason = body.get("reason", "")
    await db.commit()
    return SuccessResponse(message="Payment refunded")

@router.get("/config")
async def get_config(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PlatformConfig))
    return {c.key: {"value": c.value, "description": c.description}
            for c in result.scalars().all()}

@router.patch("/config", response_model=SuccessResponse)
async def update_config(
    body: AdminConfigUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    c = (await db.execute(
        select(PlatformConfig).where(PlatformConfig.key == body.key)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, f"Config key '{body.key}' not found")
    c.value = body.value
    c.updated_by = user.id
    await db.commit()
    return SuccessResponse(message=f"Config '{body.key}' updated")

@router.get("/sos/active")
async def active_sos(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SOSEvent)
        .where(SOSEvent.status == "active")
        .order_by(SOSEvent.created_at.desc())
    )
    return [{"id": str(s.id), "job_id": str(s.job_id), 
             "triggered_by": str(s.triggered_by),
             "created_at": s.created_at.isoformat()} 
            for s in result.scalars().all()]

@router.patch("/sos/{sos_id}/acknowledge", response_model=SuccessResponse)
async def acknowledge_sos(
    sos_id: UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    sos = (await db.execute(select(SOSEvent).where(SOSEvent.id == sos_id))).scalar_one_or_none()
    if not sos:
        raise HTTPException(404)
    sos.status = "acknowledged"
    sos.acknowledged_by = user.id
    sos.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()
    return SuccessResponse(message="SOS acknowledged")
```

---

## schemas.py — MISSING SCHEMAS TO ADD

Add these to your existing schemas.py:

```python
# Token response
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"

# User schemas
class OTPSendRequest(BaseModel):
    email: EmailStr

class OTPVerifyRequest(BaseModel):
    email: EmailStr
    token: str

class UserUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = None

class UserPreferenceResponse(KaargarBase):
    user_id: UUID
    top_categories: list
    top_tags: list
    preferred_mode: str | None
    home_lat: float | None
    home_lon: float | None
    home_address: str | None
    pune_area: str | None

class UserPreferenceUpdate(BaseModel):
    preferred_mode: str | None = None
    home_lat: float | None = None
    home_lon: float | None = None
    home_address: str | None = None
    pune_area: str | None = None

# Worker profile create
class WorkerProfileCreate(BaseModel):
    bio: str | None = None
    experience_years: int = 0
    pune_area: str | None = None
    service_radius_km: int = 5
    category_ids: list[UUID] = []

# Package schemas
class PackageUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    original_price: Decimal | None = None
    discounted_price: Decimal | None = None
    is_active: bool | None = None

# Offer schemas
class OfferUpdate(BaseModel):
    title: str | None = None
    discount_value: Decimal | None = None
    is_active: bool | None = None

# Media
class MediaResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    service_id: UUID | None = None
    type: str
    cloudinary_url: str     # this IS the Supabase URL
    cloudinary_id: str      # this IS the Supabase path
    thumbnail_url: str | None = None
    caption: str | None = None
    is_featured: bool
    view_count: int
    sort_order: int
    created_at: datetime

class MediaUploadResponse(BaseModel):
    url: str
    path: str
    bucket: str
    media_id: str | None = None
    media_type: str | None = None

# Worker status
class WorkerStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(online|offline)$")

# Worker location
class WorkerLocationUpdate(BaseModel):
    lat: float
    lon: float
    accuracy_m: float | None = None
    heading: float | None = None

# Worker public profile
class WorkerPublicResponse(KaargarBase):
    id: UUID
    user_id: UUID
    bio: str | None = None
    experience_years: int
    pune_area: str | None = None
    avg_rating: Decimal
    rating_count: int
    total_jobs_completed: int
    acceptance_rate: Decimal
    status: str
    is_instant_available: bool
    is_discovery_available: bool
    full_name: str | None = None  # joined from users
    avatar_url: str | None = None

# Chat
class ChatResponse(KaargarBase):
    id: UUID
    job_id: UUID
    user_id: UUID
    worker_id: UUID
    is_active: bool
    created_at: datetime

class MessageCreate(BaseModel):
    content: str

class MessageResponse(KaargarBase):
    id: UUID
    chat_id: UUID
    sender_id: UUID
    sender_role: str
    type: str
    content: str | None = None    # sanitized content (raw_content NEVER returned)
    media_url: str | None = None
    system_event: str | None = None
    is_read: bool
    created_at: datetime

# Pune area
class PuneAreaResponse(KaargarBase):
    id: UUID
    name: str
    lat: Decimal
    lon: Decimal

# Admin
class AdminDashboard(BaseModel):
    active_jobs: int
    online_workers: int
    today_revenue: Decimal
    fill_rate: float
    searching_jobs: int

class AdminWorkerAction(BaseModel):
    reason: str | None = None

class AdminConfigUpdate(BaseModel):
    key: str
    value: str

# Generic
class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "OK"
```

---

## routers/__init__.py

```python
# Keep empty — just marks directory as package
```

---

## RUNNING THE APP

```bash
cd backend
pip install -r requirements.txt

# Development
uvicorn main:app --reload --port 8000

# Production
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

## ENVIRONMENT VARIABLES NEEDED

```bash
# .env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres
JWT_SECRET_KEY=at-least-32-characters-of-secret
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USERNAME=resend
SMTP_PASSWORD=re_xxx
SMTP_FROM_EMAIL=noreply@kaargar.in
FRONTEND_URL=http://localhost:5173
```
