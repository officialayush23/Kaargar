"""
Kaargar — Scheduling Service
============================
Implements lazy-assignment scheduling for Discovery and Package jobs.

Core principle
--------------
We do NOT assign a worker at booking time.
We assign CLOSE TO EXECUTION — same day or 1-2 hours before window_start.

The APScheduler task (tasks/scheduling.py) calls assign_scheduled_jobs()
every 3 minutes. That function finds all pending scheduled jobs whose
preferred_days contain today, checks each eligible worker, and assigns
the best one.

Walk-in vs On-site
------------------
- walk-in: no scheduling needed (user goes to worker's location).
  Still tracked as a job; payment enforced in-app.
- onsite:  uses this full scheduling system.

Company/contractor workers
--------------------------
If worker_profile.worker_type == 'company', they are eligible for
dispatch even if their personal status is 'busy' (they may delegate
to an employee). Reflected in the eligibility query.
"""

from __future__ import annotations

import uuid
import logging
from datetime import datetime, date, time, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, text

from models import (
    WorkerProfile, WorkerAvailability, WorkerTimeOff,
    WorkerScheduleBlock, Job, JobEvent, Notification,
)

log = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

# How many hours before window_start we start assigning workers
ASSIGN_AHEAD_HOURS = 2

# Max radius (km) to search for workers for scheduled jobs
SCHEDULED_SEARCH_RADIUS_KM = 10

# Scoring weights for worker ranking (same as instant matching)
W_DISTANCE   = 0.30
W_RATING     = 0.20
W_ACCEPTANCE = 0.15
W_COMPLETION = 0.15
W_RESPONSE   = 0.10
W_PRICE      = 0.10


# ── Availability check ─────────────────────────────────────────────────────────

async def check_worker_availability(
    db: AsyncSession,
    worker_id: uuid.UUID,
    check_date: date,
    window_start: time,
    window_end: time,
) -> bool:
    """
    Returns True if the worker is available for the given date and window.

    Checks (in order):
    1. worker_availability — worker has this day_of_week marked is_open
       and their working hours cover the requested window.
    2. worker_time_off — no time-off block overlapping this window.
    3. worker_schedule_blocks — no existing scheduled block on this date
       whose window overlaps the requested window.
    """
    # 1. Recurring weekly availability
    # day_of_week: 0=Monday … 6=Sunday (Python weekday())
    day_of_week = check_date.weekday()

    avail_result = await db.execute(
        select(WorkerAvailability).where(
            WorkerAvailability.worker_id == worker_id,
            WorkerAvailability.day_of_week == day_of_week,
            WorkerAvailability.is_open == True,
        )
    )
    avail = avail_result.scalar_one_or_none()
    if not avail:
        log.debug("Worker %s not open on day %s", worker_id, day_of_week)
        return False

    # The worker's window must cover the requested window
    if avail.start_time > window_start or avail.end_time < window_end:
        log.debug(
            "Worker %s hours %s–%s don't cover %s–%s",
            worker_id, avail.start_time, avail.end_time, window_start, window_end,
        )
        return False

    # 2. Time-off: check for any block overlapping [check_date window_start, check_date window_end]
    check_start_dt = datetime.combine(check_date, window_start, tzinfo=timezone.utc)
    check_end_dt   = datetime.combine(check_date, window_end,   tzinfo=timezone.utc)

    time_off_result = await db.execute(
        select(WorkerTimeOff).where(
            WorkerTimeOff.worker_id == worker_id,
            WorkerTimeOff.start_datetime < check_end_dt,
            WorkerTimeOff.end_datetime   > check_start_dt,
        )
    )
    if time_off_result.scalar_one_or_none():
        log.debug("Worker %s on time-off for %s %s–%s", worker_id, check_date, window_start, window_end)
        return False

    # 3. Schedule blocks: overlapping window on same date
    # Two windows overlap when start_a < end_b AND end_a > start_b
    block_result = await db.execute(
        select(WorkerScheduleBlock).where(
            WorkerScheduleBlock.worker_id    == worker_id,
            WorkerScheduleBlock.date         == check_date,
            WorkerScheduleBlock.window_start < window_end,
            WorkerScheduleBlock.window_end   > window_start,
        )
    )
    if block_result.scalar_one_or_none():
        log.debug("Worker %s has schedule conflict on %s %s–%s", worker_id, check_date, window_start, window_end)
        return False

    return True


async def create_schedule_block(
    db: AsyncSession,
    worker_id: uuid.UUID,
    job_id: uuid.UUID,
    block_date: date,
    window_start: time,
    window_end: time,
) -> WorkerScheduleBlock:
    """
    Reserve a time window for a worker on a specific date.
    Call this immediately after assigning a worker to a scheduled job.
    """
    block = WorkerScheduleBlock(
        worker_id    = worker_id,
        job_id       = job_id,
        date         = block_date,
        window_start = window_start,
        window_end   = window_end,
    )
    db.add(block)
    await db.flush()
    return block


# ── Eligible worker query ─────────────────────────────────────────────────────

async def find_eligible_workers(
    db: AsyncSession,
    job: Job,
    check_date: date,
) -> list[WorkerProfile]:
    """
    Find workers eligible to fulfill a scheduled job on check_date.

    Eligibility:
    - approved, not suspended
    - within SCHEDULED_SEARCH_RADIUS_KM of the job location
    - matched to the job's category
    - not on time-off during the requested window
    - no conflicting schedule block
    - recurring availability covers the requested window

    Companies are included even if their own status is 'busy'.
    """
    from geoalchemy2.functions import ST_DWithin, ST_MakePoint

    window_start: time = job.window_start
    window_end:   time = job.window_end
    day_of_week        = check_date.weekday()

    check_start_dt = datetime.combine(check_date, window_start, tzinfo=timezone.utc)
    check_end_dt   = datetime.combine(check_date, window_end,   tzinfo=timezone.utc)

    # Base query: approved workers in category, within radius, online or company
    result = await db.execute(
        select(WorkerProfile)
        .join(WorkerAvailability, and_(
            WorkerAvailability.worker_id   == WorkerProfile.id,
            WorkerAvailability.day_of_week == day_of_week,
            WorkerAvailability.is_open     == True,
            WorkerAvailability.start_time  <= window_start,
            WorkerAvailability.end_time    >= window_end,
        ))
        .where(
            WorkerProfile.verification_status == "approved",
            WorkerProfile.is_suspended        == False,
            # Company workers bypass the 'online' status requirement
            or_(
                WorkerProfile.status.in_(["online", "available"]),
                WorkerProfile.worker_type == "company",
            ),
            # PostGIS radius filter
            ST_DWithin(
                WorkerProfile.location_geom,
                ST_MakePoint(float(job.location_lon), float(job.location_lat)).cast("geography"),
                SCHEDULED_SEARCH_RADIUS_KM * 1000,
            ),
        )
    )
    candidates = result.scalars().all()

    if not candidates:
        return []

    # Filter out workers with time-off or conflicting blocks
    eligible = []
    for worker in candidates:
        available = await check_worker_availability(
            db, worker.id, check_date, window_start, window_end
        )
        if available:
            eligible.append(worker)

    return eligible


def score_worker(worker: WorkerProfile, job: Job) -> float:
    """
    Rank a worker candidate using weighted scoring.
    Returns a float 0.0–1.0 (higher = better).
    """
    # Rating: normalise 0–5 → 0–1
    rating_score = float(worker.avg_rating or 3.0) / 5.0

    # Acceptance rate (0–1)
    acceptance_score = float(worker.acceptance_rate or 0.8)

    # Completion rate (0–1)
    completion_score = float(worker.completion_rate or 0.9)

    # Response speed: avg_response_minutes (lower is better); cap at 30 min
    avg_resp = float(worker.avg_response_minutes or 10.0)
    response_score = max(0.0, 1.0 - avg_resp / 30.0)

    # Distance: use cancellation_score as a proxy (closer workers tend to have
    # higher completion). Actual distance scoring requires the job location
    # and PostGIS, so we approximate with cancellation_score.
    cancellation_multiplier = float(worker.cancellation_score or 1.0)

    raw = (
        W_RATING     * rating_score     +
        W_ACCEPTANCE * acceptance_score +
        W_COMPLETION * completion_score +
        W_RESPONSE   * response_score   +
        # Remaining weights (distance + price) absorbed into rating proxy
        (W_DISTANCE + W_PRICE) * rating_score
    )
    return raw * cancellation_multiplier


# ── Assignment ────────────────────────────────────────────────────────────────

async def _assign_job(
    db: AsyncSession,
    job: Job,
    worker: WorkerProfile,
    assigned_date: date,
) -> None:
    """
    Assign a scheduled job to a worker.
    Sets job fields, creates a schedule block, sends notifications.
    """
    now_utc = datetime.now(timezone.utc)

    job.worker_id     = worker.id
    job.assigned_date = assigned_date
    job.assigned_at   = now_utc
    job.status        = "assigned"

    # Reserve the time window
    await create_schedule_block(
        db, worker.id, job.id, assigned_date, job.window_start, job.window_end
    )

    # Job event
    db.add(JobEvent(
        job_id   = job.id,
        status   = "assigned",
        actor    = "system",
        actor_id = job.user_id,
        meta     = {
            "assigned_date": assigned_date.isoformat(),
            "window_start": str(job.window_start),
            "window_end": str(job.window_end),
        },
    ))

    # Notify worker
    db.add(Notification(
        user_id = worker.user_id,
        type    = "job_assigned",
        title   = "New scheduled job",
        body    = (
            f"You have a job on {assigned_date.strftime('%d %b')} "
            f"between {_fmt_time(job.window_start)} – {_fmt_time(job.window_end)}"
        ),
        data    = {"job_id": str(job.id)},
    ))

    # Notify user
    db.add(Notification(
        user_id = job.user_id,
        type    = "job_scheduled",
        title   = "Worker assigned!",
        body    = (
            f"Your worker will arrive on {assigned_date.strftime('%d %b')} "
            f"between {_fmt_time(job.window_start)} – {_fmt_time(job.window_end)}"
        ),
        data    = {"job_id": str(job.id)},
    ))

    log.info(
        "Scheduled job %s assigned to worker %s on %s",
        job.id, worker.id, assigned_date,
    )


async def _fail_job(db: AsyncSession, job: Job) -> None:
    """Mark a scheduled job as failed after all preferred days are exhausted."""
    job.status = "failed"
    db.add(JobEvent(
        job_id   = job.id,
        status   = "failed",
        actor    = "system",
        actor_id = job.user_id,
        meta     = {"reason": "no_worker_available_on_any_preferred_day"},
    ))
    db.add(Notification(
        user_id = job.user_id,
        type    = "job_failed",
        title   = "Couldn't find a worker",
        body    = "We couldn't find an available worker for your preferred days. Please reschedule.",
        data    = {"job_id": str(job.id)},
    ))
    log.warning("Scheduled job %s failed — no eligible worker on any preferred day", job.id)


# ── Main scheduler entry point ────────────────────────────────────────────────

async def assign_scheduled_jobs(db: AsyncSession) -> int:
    """
    Process all pending scheduled jobs that should be assigned today.

    A job is eligible for assignment if:
    - source in ('scheduled', 'package')
    - status = 'scheduled'  (not yet assigned)
    - today is in preferred_days
    - window_start is at least ASSIGN_AHEAD_HOURS away (or has already passed
      within today — late assignment for same-day slots)

    Returns the number of jobs successfully assigned.
    """
    now_utc   = datetime.now(timezone.utc)
    today_utc = now_utc.date()
    now_time  = now_utc.time()

    # Cutoff: we assign when now >= (window_start - ASSIGN_AHEAD_HOURS)
    # But also catch jobs where window_start has already passed today
    # (same-day, last-minute).

    # Fetch all unassigned scheduled jobs
    result = await db.execute(
        select(Job).where(
            Job.source.in_(["scheduled", "package"]),
            Job.status == "scheduled",
            Job.preferred_days.isnot(None),
        )
    )
    pending_jobs: list[Job] = result.scalars().all()

    if not pending_jobs:
        return 0

    assigned_count = 0

    for job in pending_jobs:
        preferred_days: list[str] = job.preferred_days or []
        window_start: time = job.window_start
        window_end:   time = job.window_end

        if not preferred_days or not window_start or not window_end:
            log.warning("Job %s has incomplete scheduling data, skipping", job.id)
            continue

        # Check if today is in preferred_days
        today_str = today_utc.isoformat()
        if today_str not in preferred_days:
            # Not today — check if all preferred days are in the past
            future_days = [d for d in preferred_days if date.fromisoformat(d) >= today_utc]
            if not future_days:
                # All days have passed without assignment → fail the job
                await _fail_job(db, job)
                await db.commit()
            continue

        # Check if it's time to assign (window_start - ASSIGN_AHEAD_HOURS)
        assign_after = (
            datetime.combine(today_utc, window_start, tzinfo=timezone.utc)
            - timedelta(hours=ASSIGN_AHEAD_HOURS)
        )
        if now_utc < assign_after:
            # Too early today — will be picked up in a later scheduler run
            continue

        # Try to assign a worker for today
        workers = await find_eligible_workers(db, job, today_utc)

        if workers:
            # Rank and pick best
            best = max(workers, key=lambda w: score_worker(w, job))
            await _assign_job(db, job, best, today_utc)
            await db.commit()
            assigned_count += 1
            continue

        # No worker today — remove today from preferred_days, try next day
        remaining = [d for d in preferred_days if d != today_str]
        job.preferred_days = remaining if remaining else None

        if not remaining:
            # Exhausted all preferred days
            await _fail_job(db, job)
        else:
            log.info(
                "Job %s: no worker today (%s), will retry on %s",
                job.id, today_str, remaining,
            )

        await db.commit()

    return assigned_count


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_time(t: time | None) -> str:
    if t is None:
        return "?"
    return t.strftime("%I:%M %p").lstrip("0")
