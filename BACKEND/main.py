"""
Kaargar — FastAPI application entry point.
"""

from config import get_settings
from services.logging_config import setup_logging, RequestIDMiddleware
from services.rate_limit import RateLimitMiddleware

settings = get_settings()

# JSON structured logging — set up before anything else logs (including
# Sentry's own init below), so every log line from this point on is JSON
# with a request_id field once a request is in flight. See
# services/logging_config.py's module docstring.
setup_logging(level="DEBUG" if settings.app_env != "production" else "INFO")

# Sentry — initialized before anything else imports, so it can also catch
# errors raised while the routers/services below are being imported, not
# just runtime request errors. No-op (nothing imported, nothing sent) if
# SENTRY_DSN isn't set — safe for local dev with an empty .env value.
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        # Lower sample rate in production to control event volume/cost;
        # capture everything in development where volume is naturally low.
        traces_sample_rate=0.2 if settings.app_env == "production" else 1.0,
        # This app handles phone numbers, emails, and payment data — don't
        # let the SDK auto-attach request bodies/user PII to events.
        send_default_pii=False,
    )

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from routers import auth, categories, workers, jobs, upload, search, chat, payments, reviews, notifications, admin, support, users, geocode, addresses, translate


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start APScheduler background tasks.
    #
    # NOTE: celery_app.py now also defines Celery Beat schedules for these
    # same three jobs, meant to replace this once Render has dedicated
    # worker + beat processes deployed and confirmed running — see that
    # file's module docstring for the exact cutover steps. Until then, both
    # run in parallel (harmless — the underlying task functions are
    # idempotent), so don't remove this block without confirming Celery
    # beat/worker are actually live first.
    from tasks.escrow_release import start_escrow_scheduler
    from tasks.decay_scores import start_decay_scheduler
    from tasks.slot_rollover import start_slot_rollover_scheduler
    scheduler  = start_escrow_scheduler()
    scheduler2 = start_decay_scheduler()
    scheduler4 = start_slot_rollover_scheduler()  # runs every 24h — rolls slot windows forward
    yield
    scheduler.shutdown(wait=False)
    scheduler2.shutdown(wait=False)
    scheduler4.shutdown(wait=False)


app = FastAPI(
    title="Kaargar API",
    version="1.0.0",
    # Interactive docs + schema are a free map of every route for an attacker —
    # only served outside production.
    docs_url=None if settings.app_env == "production" else "/docs",
    openapi_url=None if settings.app_env == "production" else "/openapi.json",
    redoc_url=None,
    lifespan=lifespan,
)

# Build allowed origins list — always include localhost + configured frontend URL
_allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://kaargar1.vercel.app",
]
if settings.frontend_url and settings.frontend_url not in _allowed_origins:
    _allowed_origins.append(settings.frontend_url)
for _o in (o.strip().rstrip("/") for o in settings.cors_extra_origins.split(",")):
    if _o and _o not in _allowed_origins:
        _allowed_origins.append(_o)

# No origin regex. The old `https://kaargar.*\.vercel\.app` matched ANY Vercel
# project whose name starts with "kaargar" (anyone can create one) while
# allow_credentials=True. Add real origins via FRONTEND_URL / CORS_EXTRA_ORIGINS.

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Assigns/propagates X-Request-ID and tags every log line + Sentry event
# emitted during a request with it — see services/logging_config.py.
app.add_middleware(RequestIDMiddleware)

# Per-IP limits, fail-open without Redis — see services/rate_limit.py.
app.add_middleware(RateLimitMiddleware)

# All routers under /v1
app.include_router(auth.router,          prefix="/v1/auth",          tags=["auth"])
app.include_router(categories.router,    prefix="/v1/categories",    tags=["categories"])
app.include_router(workers.router,       prefix="/v1/workers",       tags=["workers"])
app.include_router(jobs.router,          prefix="/v1/jobs",          tags=["jobs"])
app.include_router(upload.router,        prefix="/v1/upload",        tags=["upload"])
app.include_router(search.router,        prefix="/v1/search",        tags=["search"])
app.include_router(chat.router,          prefix="/v1/chat",          tags=["chat"])
app.include_router(payments.router,      prefix="/v1/payments",      tags=["payments"])
app.include_router(reviews.router,       prefix="/v1/reviews",       tags=["reviews"])
app.include_router(notifications.router, prefix="/v1/notifications", tags=["notifications"])
app.include_router(support.router,       prefix="/v1/support",       tags=["support"])
app.include_router(admin.router,         prefix="/v1/admin",         tags=["admin"])
app.include_router(users.router,         prefix="/v1/users",         tags=["users"])
app.include_router(geocode.router,       prefix="/v1/geocode",       tags=["geocode"])
app.include_router(addresses.router,     prefix="/v1/addresses",     tags=["addresses"])
app.include_router(translate.router,      prefix="/v1/translate",     tags=["translate"])

@app.get("/")
async def root():
    return {"status": "ok", "app": "Kaargar API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
