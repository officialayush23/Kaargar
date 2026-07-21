# """
# Matching engine — instant job dispatch.
# Runs as FastAPI BackgroundTask (not Celery).
# """

# import asyncio
# from datetime import datetime, timezone, timedelta
# from decimal import Decimal

# from sqlalchemy import select, text
# from sqlalchemy.ext.asyncio import AsyncSession

# from database import async_session
# from models import Job, WorkerProfile, WorkerLocation, JobWorkerRequest, Chat
# from services.notifications import notify_job_assigned, notify_worker_new_job
# from config import get_settings

# settings = get_settings()


# def calc_commission(job_type: str, amount: float) -> dict:
#     if job_type == "instant":
#         rate = 0.15
#     else:
#         rate = 0.10 + 0.05 * min(amount / 50_000, 1.0)
#         rate = round(rate, 4)
#     fee = round(amount * rate, 2)
#     gst = round(fee * 0.18, 2)
#     payout = round(amount - fee - gst, 2)
#     return {"rate": rate, "fee": fee, "gst": gst, "payout": payout}


# async def dispatch_job(job_id: str):
#     # Acquire Redis dispatch lock
#     lock_acquired = False
#     r = None
#     try:
#         import redis.asyncio as aioredis
#         r = aioredis.from_url(settings.redis_url)
#         lock_key = f"dispatch_lock:{job_id}"
#         lock_acquired = await r.set(lock_key, 1, nx=True, ex=30)
#         if not lock_acquired:
#             return
#     except Exception:
#         lock_acquired = True  # proceed without lock in dev

#     try:
#         async with async_session() as db:
#             await _run_dispatch(db, job_id)
#     finally:
#         if r and lock_acquired:
#             await r.delete(f"dispatch_lock:{job_id}")
#             await r.aclose()


# async def _run_dispatch(db: AsyncSession, job_id: str):
#     import uuid
#     result = await db.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
#     job = result.scalar_one_or_none()
#     if not job or job.status not in ("requested", "searching"):
#         return

#     job.status = "searching"
#     await db.commit()

#     radii = [2, 3, 4, 5]

#     for radius_km in radii:
#         workers = await _find_workers(db, job, radius_km)
#         if not workers:
#             continue

#         now = datetime.now(timezone.utc)
#         expires_at = now + timedelta(seconds=10)
#         requests_created = []

#         for wp, distance_km, score in workers[:5]:
#             req = JobWorkerRequest(
#                 job_id=job.id,
#                 worker_id=wp.id,
#                 status="pending",
#                 radius_km=Decimal(str(radius_km)),
#                 distance_km=Decimal(str(round(distance_km, 2))),
#                 score_at_dispatch=Decimal(str(round(score, 4))),
#                 expires_at=expires_at,
#             )
#             db.add(req)
#             await db.flush()
#             requests_created.append((req, wp))

#         job.workers_notified = (job.workers_notified or 0) + len(requests_created)
#         job.dispatch_rounds = (job.dispatch_rounds or 0) + 1
#         await db.commit()

#         # Send notifications
#         for req, wp in requests_created:
#             await notify_worker_new_job(db, wp.user_id, job, req.id)
#         await db.commit()

#         # Poll for acceptance for 10 seconds
#         winner_req = await _poll_for_acceptance(db, job.id, expires_at)

#         if winner_req:
#             await _assign_job(db, job, winner_req)
#             # Cancel other pending requests
#             for req, _ in requests_created:
#                 if req.id != winner_req.id and req.status == "pending":
#                     req.status = "expired"
#             await db.commit()
#             return

#         # Expire remaining requests
#         for req, _ in requests_created:
#             if req.status == "pending":
#                 req.status = "expired"
#         await db.commit()

#     # All radii exhausted
#     await db.execute(
#         Job.__table__.update().where(Job.id == job.id).values(status="failed")
#     )
#     await db.commit()


# async def _find_workers(db: AsyncSession, job: Job, radius_km: int) -> list:
#     sql = text("""
#         SELECT
#             wp.id,
#             ST_Distance(
#                 wl.geom::geography,
#                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
#             ) / 1000.0 AS distance_km,
#             (
#                 (1.0 - ST_Distance(
#                     wl.geom::geography,
#                     ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
#                 ) / 1000.0 / :radius_km) * 0.30
#                 + (wp.avg_rating / 5.0) * 0.20
#                 + wp.acceptance_rate * 0.15
#                 + wp.completion_rate * 0.15
#                 + (1.0 - LEAST(wp.avg_response_time_sec::float / 60.0, 1.0)) * 0.10
#                 + 0.10
#             ) * wp.cancellation_score AS score
#         FROM worker_profiles wp
#         JOIN worker_locations wl ON wl.worker_id = wp.id
#         WHERE
#             wp.status = 'online'
#             AND wp.verification_status = 'approved'
#             AND wp.is_instant_available = true
#             AND (wp.auto_offline_until IS NULL OR wp.auto_offline_until < NOW())
#             AND wl.updated_at > NOW() - INTERVAL '2 minutes'
#             AND ST_DWithin(
#                 wl.geom::geography,
#                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
#                 :radius_m
#             )
#         ORDER BY score DESC
#         LIMIT 10
#     """)

#     result = await db.execute(sql, {
#         "lat": float(job.location_lat),
#         "lon": float(job.location_lon),
#         "radius_km": radius_km,
#         "radius_m": radius_km * 1000,
#     })
#     rows = result.fetchall()

#     workers = []
#     for row in rows:
#         wp_result = await db.execute(
#             select(WorkerProfile).where(WorkerProfile.id == row[0])
#         )
#         wp = wp_result.scalar_one_or_none()
#         if wp:
#             workers.append((wp, float(row[1]), float(row[2])))
#     return workers


# async def _poll_for_acceptance(db: AsyncSession, job_id, expires_at: datetime):
#     from models import JobWorkerRequest
#     import uuid
#     while datetime.now(timezone.utc) < expires_at:
#         result = await db.execute(
#             select(JobWorkerRequest)
#             .where(JobWorkerRequest.job_id == job_id)
#             .where(JobWorkerRequest.status == "accepted")
#             .limit(1)
#         )
#         winner = result.scalar_one_or_none()
#         if winner:
#             return winner
#         await asyncio.sleep(0.5)
#     return None


# async def _assign_job(db: AsyncSession, job: Job, req: JobWorkerRequest):
#     now = datetime.now(timezone.utc)
#     job.worker_id = req.worker_id
#     job.status = "assigned"
#     job.assigned_at = now

#     # Set worker to busy
#     wp_result = await db.execute(
#         select(WorkerProfile).where(WorkerProfile.id == req.worker_id)
#     )
#     wp = wp_result.scalar_one_or_none()
#     if wp:
#         wp.status = "busy"
#         wp.consecutive_rejects = 0

#     # Create chat room
#     chat = Chat(
#         job_id=job.id,
#         user_id=job.user_id,
#         worker_id=req.worker_id,
#     )
#     db.add(chat)

#     # Notify user
#     await notify_job_assigned(db, job)


"""
Matching engine — instant job dispatch.
Runs as FastAPI BackgroundTask (not Celery).
"""

import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session
from models import Job, WorkerProfile, WorkerLocation, JobWorkerRequest, Chat
from services.notifications import notify_job_assigned, notify_worker_new_job
from services.config import get_config
from config import get_settings

settings = get_settings()


async def calc_commission(db: AsyncSession, job_type: str, amount: float) -> dict:
    if job_type == "instant":
        rate = float(await get_config(db, "commission_instant_rate", Decimal("0.12")))
    else:
        base = float(await get_config(db, "commission_discovery_base", Decimal("0.10")))
        increment = float(await get_config(db, "commission_discovery_increment", Decimal("0.05")))
        threshold = float(await get_config(db, "commission_discovery_threshold", Decimal("50000")))
        rate = base + increment * min(amount / threshold, 1.0)
        rate = round(rate, 4)
    gst_rate = float(await get_config(db, "gst_rate", Decimal("0.18")))
    fee = round(amount * rate, 2)
    gst = round(fee * gst_rate, 2)
    payout = round(amount - fee - gst, 2)
    return {"rate": rate, "fee": fee, "gst": gst, "payout": payout}


async def dispatch_job(job_id: str):
    # Re-acquire the dispatch lock — prevents two overlapping dispatch rounds
    # from racing on the same job (e.g. a retried BackgroundTask, or a manual
    # re-trigger while a round is already in flight).
    lock_acquired = False
    r = None
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        lock_key = f"dispatch_lock:{job_id}"
        lock_acquired = await r.set(lock_key, 1, nx=True, ex=30)
        if not lock_acquired:
            return
    except Exception:
        lock_acquired = True  # Redis unavailable — proceed without the lock rather than blocking dispatch

    try:
        async with async_session() as db:
            await _run_dispatch(db, job_id)
    except Exception as e:
        print(f"Dispatch error: {e}")
    finally:
        if r and lock_acquired:
            try:
                await r.delete(f"dispatch_lock:{job_id}")
                await r.aclose()
            except Exception:
                pass


async def _run_dispatch(db: AsyncSession, job_id: str):
    import uuid
    result = await db.execute(select(Job).where(Job.id == uuid.UUID(job_id)))
    job = result.scalar_one_or_none()
    if not job or job.status not in ("requested", "searching"):
        return

    job.status = "searching"
    await db.commit()

    radius_start = int(await get_config(db, "dispatch_radius_start_km", 2))
    radius_max = int(await get_config(db, "dispatch_radius_max_km", 5))
    radius_step = int(await get_config(db, "dispatch_radius_step_km", 1))
    accept_window_sec = int(await get_config(db, "dispatch_accept_window_sec", 10))
    max_workers_per_round = int(await get_config(db, "dispatch_max_workers_per_round", 5))

    radii = list(range(radius_start, radius_max + 1, radius_step)) or [radius_start]

    for radius_km in radii:
        workers = await _find_workers(db, job, radius_km)
        if not workers:
            continue

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=accept_window_sec)
        requests_created = []

        for wp, distance_km, score in workers[:max_workers_per_round]:
            req = JobWorkerRequest(
                job_id=job.id,
                worker_id=wp.id,
                status="pending",
                radius_km=Decimal(str(radius_km)),
                distance_km=Decimal(str(round(distance_km, 2))),
                score_at_dispatch=Decimal(str(round(score, 4))),
                expires_at=expires_at,
            )
            db.add(req)
            await db.flush()
            requests_created.append((req, wp))

        job.workers_notified = (job.workers_notified or 0) + len(requests_created)
        job.dispatch_rounds = (job.dispatch_rounds or 0) + 1
        await db.commit()

        # Send notifications
        for req, wp in requests_created:
            await notify_worker_new_job(db, wp.user_id, job, req.id)
        await db.commit()

        # Poll for acceptance for 10 seconds
        winner_req = await _poll_for_acceptance(db, job.id, expires_at)

        if winner_req:
            await _assign_job(db, job, winner_req)
            # Cancel other pending requests
            for req, _ in requests_created:
                if req.id != winner_req.id and req.status == "pending":
                    req.status = "expired"
            await db.commit()
            return

        # Expire remaining requests
        for req, _ in requests_created:
            if req.status == "pending":
                req.status = "expired"
        await db.commit()

    # All radii exhausted
    await db.execute(
        Job.__table__.update().where(Job.id == job.id).values(status="failed")
    )
    await db.commit()


async def _find_workers(db: AsyncSession, job: Job, radius_km: int) -> list:
    sql = text("""
        SELECT
            wp.id,
            ST_Distance(
                wl.geom::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
            ) / 1000.0 AS distance_km,
            (
                (1.0 - ST_Distance(
                    wl.geom::geography,
                    ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
                ) / 1000.0 / :radius_km) * 0.30
                + (wp.avg_rating / 5.0) * 0.20
                + wp.acceptance_rate * 0.15
                + wp.completion_rate * 0.15
                + (1.0 - LEAST(wp.avg_response_time_sec::float / 60.0, 1.0)) * 0.10
                + 0.10
            ) * wp.cancellation_score AS score
        FROM worker_profiles wp
        JOIN worker_locations wl ON wl.worker_id = wp.id
        WHERE
            wp.status = 'online'
            AND wp.verification_status = 'approved'
            AND wp.is_instant_available = true
            AND (wp.auto_offline_until IS NULL OR wp.auto_offline_until < NOW())
            AND wl.updated_at > NOW() - INTERVAL '2 minutes'
            AND ST_DWithin(
                wl.geom::geography,
                ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
                :radius_m
            )
        ORDER BY score DESC
        LIMIT 10
    """)

    result = await db.execute(sql, {
        "lat": float(job.location_lat),
        "lon": float(job.location_lon),
        "radius_km": radius_km,
        "radius_m": radius_km * 1000,
    })
    rows = result.fetchall()

    workers = []
    for row in rows:
        wp_result = await db.execute(
            select(WorkerProfile).where(WorkerProfile.id == row[0])
        )
        wp = wp_result.scalar_one_or_none()
        if wp:
            workers.append((wp, float(row[1]), float(row[2])))
    return workers


async def _poll_for_acceptance(db: AsyncSession, job_id, expires_at: datetime):
    from models import JobWorkerRequest
    import uuid
    while datetime.now(timezone.utc) < expires_at:
        result = await db.execute(
            select(JobWorkerRequest)
            .where(JobWorkerRequest.job_id == job_id)
            .where(JobWorkerRequest.status == "accepted")
            .limit(1)
        )
        winner = result.scalar_one_or_none()
        if winner:
            return winner
        await asyncio.sleep(0.5)
    return None


async def _assign_job(db: AsyncSession, job: Job, req: JobWorkerRequest):
    now = datetime.now(timezone.utc)
    job.worker_id = req.worker_id
    job.status = "assigned"
    job.assigned_at = now

    # ── Set quoted_price from the service if it was never populated ──────────
    # create_job only sets quoted_price from whatever the client sent (often
    # nothing, for category-based instant bookings), so an instant job tied to
    # a specific service could reach completion with quoted_price still NULL,
    # which meant final_price/commission ended up 0. Mirror the same
    # "base_price if set else price" fallback used everywhere else (book_slot,
    # create_scheduled_job) before this job is finalized.
    if job.quoted_price is None and job.service_id:
        from models import Service
        svc_result = await db.execute(select(Service).where(Service.id == job.service_id))
        svc = svc_result.scalar_one_or_none()
        if svc is not None:
            unit_price = svc.base_price if svc.base_price is not None else svc.price
            if unit_price is not None:
                job.quoted_price = unit_price

    # Set worker to busy
    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == req.worker_id)
    )
    wp = wp_result.scalar_one_or_none()
    if wp:
        wp.status = "busy"
        wp.consecutive_rejects = 0

    # Create chat room
    chat = Chat(
        job_id=job.id,
        user_id=job.user_id,
        worker_id=req.worker_id,
    )
    db.add(chat)

    # Notify user
    await notify_job_assigned(db, job)