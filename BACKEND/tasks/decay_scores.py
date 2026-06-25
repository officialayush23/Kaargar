"""
APScheduler tasks:
  1. restore_auto_offline_workers  — every 1 min
  2. refresh_all_worker_analytics  — every 15 min
"""

import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone, timedelta
from decimal import Decimal


def start_decay_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(restore_auto_offline_workers,  "interval", minutes=1,  id="decay_scores")
    scheduler.add_job(refresh_all_worker_analytics,  "interval", minutes=15, id="worker_analytics")
    scheduler.start()
    return scheduler


async def restore_auto_offline_workers():
    from database import async_session
    from models import WorkerProfile
    from sqlalchemy import select

    try:
        async with async_session() as db:
            now = datetime.now(timezone.utc)
            result = await db.execute(
                select(WorkerProfile)
                .where(WorkerProfile.status == "offline")
                .where(WorkerProfile.auto_offline_until != None)
                .where(WorkerProfile.auto_offline_until <= now)
            )
            workers = result.scalars().all()
            for wp in workers:
                wp.status = "online"
                wp.auto_offline_until = None
            if workers:
                await db.commit()
                print(f"[DECAY] Restored {len(workers)} workers from auto-offline")
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        print(f"[DECAY] Skipped run due to DB error: {exc}")


async def refresh_all_worker_analytics():
    """Recompute WorkerAnalytics for every worker from real job/payment data."""
    try:
        async with __import__('database').async_session() as db:
            await _recompute_analytics(db, worker_id=None)
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        print(f"[ANALYTICS] Skipped run due to DB error: {exc}")


async def refresh_worker_analytics_for(worker_id):
    """Recompute analytics for a single worker — called immediately on job completion."""
    try:
        async with __import__('database').async_session() as db:
            await _recompute_analytics(db, worker_id=worker_id)
    except Exception as exc:
        print(f"[ANALYTICS] Failed for worker {worker_id}: {exc}")


async def _recompute_analytics(db, worker_id=None):
    """
    Core analytics computation.
    If worker_id is None, recomputes all workers (batch scheduler run).
    If worker_id is provided, recomputes only that worker (on-demand after job complete).
    """
    from models import WorkerProfile, WorkerAnalytics, Job, Payment
    from sqlalchemy import select, func

    now = datetime.now(timezone.utc)
    today_start  = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start   = today_start - timedelta(days=now.weekday())
    month_start  = today_start.replace(day=1)

    # Fetch workers to process
    q = select(WorkerProfile)
    if worker_id is not None:
        q = q.where(WorkerProfile.id == worker_id)
    workers = (await db.execute(q)).scalars().all()

    for wp in workers:
        # ── Earnings from released payments ───────────────────────────────
        def earn_q(since):
            return (
                select(func.coalesce(func.sum(Job.worker_payout), 0))
                .where(Job.worker_id == wp.id)
                .where(Job.status == "completed")
                .where(Job.updated_at >= since)
            )

        today_earn  = await db.scalar(earn_q(today_start))
        week_earn   = await db.scalar(earn_q(week_start))
        month_earn  = await db.scalar(earn_q(month_start))
        total_earn  = await db.scalar(
            select(func.coalesce(func.sum(Job.worker_payout), 0))
            .where(Job.worker_id == wp.id)
            .where(Job.status == "completed")
        )

        # ── Job counts ────────────────────────────────────────────────────
        def jobs_q(since):
            return (
                select(func.count(Job.id))
                .where(Job.worker_id == wp.id)
                .where(Job.status == "completed")
                .where(Job.updated_at >= since)
            )

        today_jobs  = await db.scalar(jobs_q(today_start))
        week_jobs   = await db.scalar(jobs_q(week_start))
        month_jobs  = await db.scalar(jobs_q(month_start))
        total_jobs  = await db.scalar(
            select(func.count(Job.id))
            .where(Job.worker_id == wp.id)
            .where(Job.status == "completed")
        )

        avg_job_val = Decimal(str(total_earn)) / max(total_jobs, 1) if total_jobs else Decimal("0")

        # ── Avg rating last 30 days ───────────────────────────────────────
        from models import Review
        avg_30d = await db.scalar(
            select(func.coalesce(func.avg(Review.rating), 0))
            .where(Review.worker_id == wp.id)
            .where(Review.created_at >= now - timedelta(days=30))
        )

        # ── Cancellations last 30 days ────────────────────────────────────
        cancel_30d = await db.scalar(
            select(func.count(Job.id))
            .where(Job.worker_id == wp.id)
            .where(Job.status == "cancelled")
            .where(Job.updated_at >= now - timedelta(days=30))
        )

        # ── Top category (most completed jobs) ───────────────────────────
        top_cat_row = await db.execute(
            select(Job.category_id, func.count(Job.id).label("cnt"))
            .where(Job.worker_id == wp.id)
            .where(Job.status == "completed")
            .where(Job.category_id != None)
            .group_by(Job.category_id)
            .order_by(func.count(Job.id).desc())
            .limit(1)
        )
        top_cat = top_cat_row.first()

        # ── Upsert WorkerAnalytics ────────────────────────────────────────
        existing = await db.execute(
            select(WorkerAnalytics).where(WorkerAnalytics.worker_id == wp.id)
        )
        analytics = existing.scalar_one_or_none()

        if analytics:
            analytics.total_earnings        = Decimal(str(total_earn))
            analytics.total_jobs            = total_jobs or 0
            analytics.month_earnings        = Decimal(str(month_earn))
            analytics.month_jobs            = month_jobs or 0
            analytics.week_earnings         = Decimal(str(week_earn))
            analytics.week_jobs             = week_jobs or 0
            analytics.today_earnings        = Decimal(str(today_earn))
            analytics.today_jobs            = today_jobs or 0
            analytics.avg_job_value         = avg_job_val
            analytics.avg_rating_30d        = Decimal(str(round(float(avg_30d or 0), 2)))
            analytics.cancellation_count_30d = cancel_30d or 0
            analytics.top_category_id       = top_cat[0] if top_cat else None
            analytics.updated_at            = now
        else:
            db.add(WorkerAnalytics(
                worker_id               = wp.id,
                total_earnings          = Decimal(str(total_earn)),
                total_jobs              = total_jobs or 0,
                month_earnings          = Decimal(str(month_earn)),
                month_jobs              = month_jobs or 0,
                week_earnings           = Decimal(str(week_earn)),
                week_jobs               = week_jobs or 0,
                today_earnings          = Decimal(str(today_earn)),
                today_jobs              = today_jobs or 0,
                avg_job_value           = avg_job_val,
                avg_rating_30d          = Decimal(str(round(float(avg_30d or 0), 2))),
                cancellation_count_30d  = cancel_30d or 0,
                top_category_id         = top_cat[0] if top_cat else None,
                updated_at              = now,
            ))

    await db.commit()
    if worker_id is None:
        print(f"[ANALYTICS] Refreshed {len(workers)} workers")
