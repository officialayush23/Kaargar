"""
Kaargar — FastAPI application entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import get_settings
from routers import auth, categories, workers, jobs, upload, search, chat, payments, reviews, notifications, admin, support, users

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start APScheduler background tasks
    from tasks.escrow_release import start_escrow_scheduler
    from tasks.decay_scores import start_decay_scheduler
    scheduler = start_escrow_scheduler()
    scheduler2 = start_decay_scheduler()
    yield
    scheduler.shutdown(wait=False)
    scheduler2.shutdown(wait=False)


app = FastAPI(
    title="Kaargar API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}