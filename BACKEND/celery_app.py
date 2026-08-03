"""
Celery application — background job queue backed by Upstash Redis.

Adds a real broker-backed queue + beat scheduler alongside the existing
in-process APScheduler jobs (tasks/escrow_release.py, tasks/decay_scores.py,
tasks/slot_rollover.py) — per the decision to migrate once Redis was
properly wired up as a TCP (rediss://) connection, not the REST API
credentials Upstash also exposes. Kept to Celery Beat (a static,
code-defined schedule) rather than RedBeat for now: RedBeat's dynamic,
Redis-backed schedule is worth adding later if/when something needs
admin-editable schedules (e.g. promo campaign send times) — not before,
since that's real added complexity with no user of it yet.

IMPORTANT — this does NOT replace APScheduler yet. main.py's lifespan still
starts all three APScheduler jobs. Both can run side by side harmlessly
(they'd just do the same idempotent work twice), but running both in
production long-term is wasteful. Cut over by:
  1. Deploying two new Render services pointed at this repo:
       - Background Worker: `celery -A celery_app worker --loglevel=info`
       - Cron/Background Worker: `celery -A celery_app beat --loglevel=info`
     Both need the same env vars as the web service, especially REDIS_URL
     and DATABASE_URL(_DIRECT).
  2. Confirming (via logs) that beat is actually triggering the three tasks
     below on schedule and the worker is completing them.
  3. Only then removing the start_escrow_scheduler() / start_decay_scheduler()
     / start_slot_rollover_scheduler() calls from main.py's lifespan.
Doing it in this order means there's never a gap where neither scheduler is
actually running these (escrow release, no-show/auto-offline recovery, and
slot rollover are all real production behavior, not cosmetic).

Run locally (two separate terminals/processes):
  celery -A celery_app worker --loglevel=info
  celery -A celery_app beat --loglevel=info
"""
import ssl

from celery import Celery
from celery.schedules import crontab

from config import get_settings

settings = get_settings()

# Celery's redis transport needs ssl_cert_reqs set explicitly for rediss://
# URLs against most managed providers (Upstash included) — without this,
# some Celery/kombu versions fail the TLS handshake even though the
# certificate itself is perfectly valid. CERT_REQUIRED still validates the
# chain; this isn't disabling verification, just telling Celery how to do it.
_ssl_opts = {"ssl_cert_reqs": ssl.CERT_REQUIRED} if settings.redis_url.startswith("rediss://") else None

celery_app = Celery(
    "kaargar",
    broker=settings.redis_url,
    backend=settings.redis_url,
    # Explicit module list (not autodiscover_tasks(), which assumes a
    # Django-style app registry) — this is how Celery finds the
    # @celery_app.task-decorated functions in a plain project.
    include=[
        "tasks.escrow_release",
        "tasks.decay_scores",
        "tasks.slot_rollover",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Kolkata",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
    broker_use_ssl=_ssl_opts,
    redis_backend_use_ssl=_ssl_opts,
    # These are fire-and-forget scheduled jobs — nothing polls for a
    # result, so there's no reason to keep it around long.
    result_expires=86400,
)

# Static beat schedule — intervals match the APScheduler jobs they mirror,
# so behavior doesn't change, just the execution mechanism.
celery_app.conf.beat_schedule = {
    "escrow-release": {
        "task": "tasks.escrow_release.release_due_escrows_task",
        "schedule": 300.0,  # every 5 minutes
    },
    "decay-scores": {
        "task": "tasks.decay_scores.restore_auto_offline_workers_task",
        "schedule": 60.0,  # every 1 minute
    },
    "worker-analytics": {
        "task": "tasks.decay_scores.refresh_all_worker_analytics_task",
        "schedule": 900.0,  # every 15 minutes
    },
    "slot-rollover": {
        "task": "tasks.slot_rollover.roll_forward_slot_windows_task",
        "schedule": crontab(hour=3, minute=0),  # once a day, low-traffic hour IST
    },
}
