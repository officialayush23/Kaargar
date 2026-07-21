"""
Kaargar — Scheduling Service
============================
Availability-checking and time-window reservation for Discovery/Package
bookings that ALREADY have a specific worker pinned at booking time.

Every Discovery/Package booking pins a worker immediately
(preferred_worker_id is required on ScheduledJobCreate and
MultiDayBookingCreate — see schemas.py and routers/jobs.py). There is no
lazy/system-assigns-later mode: the old lazy-assignment design (a background
scheduler that searched for and ranked eligible workers close to execution
time) has been removed since it had no caller anywhere in the live app.

This module now only provides:
- check_worker_availability(): validate an already-pinned worker is free for
  a given date/window (time-off + conflicting schedule blocks, and — for
  brand-new pinned bookings — recurring weekly hours). Used at booking time
  and by reschedule_job() in jobs.py when revalidating a new date/window for
  an already-pinned booking.
- create_schedule_block(): reserve a worker's time window once a job is
  pinned to them, so future availability checks see the conflict.

Walk-in vs On-site
------------------
- walk-in: no scheduling needed (user goes to worker's location).
  Still tracked as a job; payment enforced in-app.
- onsite:  uses this availability-checking system.
"""

from __future__ import annotations

import uuid
import logging
from datetime import datetime, date, time, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from models import WorkerAvailability, WorkerTimeOff, WorkerScheduleBlock

log = logging.getLogger(__name__)


# ── Availability check ─────────────────────────────────────────────────────────

async def check_worker_availability(
    db: AsyncSession,
    worker_id: uuid.UUID,
    check_date: date,
    window_start: time,
    window_end: time,
    *,
    require_weekly_hours: bool = True,
    exclude_job_id: uuid.UUID | None = None,
) -> bool:
    """
    Returns True if the worker is available for the given date and window.

    Checks (in order):
    1. worker_availability — worker has this day_of_week marked is_open
       and their working hours cover the requested window. Skipped when
       require_weekly_hours=False (see below).
    2. worker_time_off — no time-off block overlapping this window.
    3. worker_schedule_blocks — no existing scheduled block on this date
       whose window overlaps the requested window (excluding exclude_job_id's
       own block, if given).

    require_weekly_hours: pass False when checking a job that ALREADY has a
    worker pinned via a direct/pinned booking (POST /jobs/scheduled or
    /jobs/scheduled/multi-day with preferred_worker_id, and POST
    /jobs/book-slot). Those bookings never validate against the worker's
    generic recurring weekly hours at creation time — a customer picking a
    specific worker can book them for any window the worker agreed to
    out-of-band (the canonical case: a round-the-clock security-guard
    booking with a 06:00–07:00 daily arrival window, while the worker's
    worker_availability row — used only for slot generation — still says the
    generic 09:00–18:00). Re-applying that weekly-hours gate later, at
    reschedule time, for the very same already-agreed booking produced false
    "worker isn't available" errors on a slot that was — and still is —
    genuinely fine. Time-off and conflicting-booking checks (2 and 3 below)
    still apply either way, since those reflect real conflicts, not a
    generic-hours mismatch.

    exclude_job_id: pass the job being rescheduled so its OWN existing
    worker_schedule_blocks row (from its current date/window) isn't
    misread as a conflict with itself when re-validating a new date/window
    for that same job.
    """
    # 1. Recurring weekly availability (skippable — see require_weekly_hours above)
    if require_weekly_hours:
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

    # 3. Schedule blocks: overlapping window on same date, excluding this
    # job's own existing reservation (if any) so a reschedule doesn't get
    # rejected for "conflicting" with itself.
    # Two windows overlap when start_a < end_b AND end_a > start_b
    block_conditions = [
        WorkerScheduleBlock.worker_id    == worker_id,
        WorkerScheduleBlock.date         == check_date,
        WorkerScheduleBlock.window_start < window_end,
        WorkerScheduleBlock.window_end   > window_start,
    ]
    if exclude_job_id is not None:
        block_conditions.append(
            or_(
                WorkerScheduleBlock.job_id.is_(None),
                WorkerScheduleBlock.job_id != exclude_job_id,
            )
        )
    block_result = await db.execute(select(WorkerScheduleBlock).where(*block_conditions))
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
    Call this immediately after pinning a worker to a scheduled job.
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
