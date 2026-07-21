"""
Shared cancellation-offense counting + worker rating-penalty helpers.

Two independent counters live here:

1. Customer cancellation-offense counter — driven entirely off
   CancellationPenalty rows where charged_role='user'. A late/repeat
   customer-initiated cancellation AND a worker-raised "customer
   unavailable on arrival" flag both feed the SAME counter (per product
   spec — they're the same offense type from the platform's point of
   view, just triggered by different parties). Every occurrence is logged
   here, including $0/waived first-offense rows, so the count stays
   accurate.

2. Worker no-show offense counter — driven off Job.no_show_status
   ='confirmed' rows for that worker. The first-ever confirmed no-show is
   forgiven (no rating hit); every one after that costs a flat -0.5 stars,
   applied via WorkerProfile.rating_penalty_total so it survives future
   review-average recomputations (see recompute_worker_rating below).
"""
from __future__ import annotations

import math
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import CancellationPenalty, WorkerProfile, Review, Job, WorkerLocation, LocationHistory

NO_SHOW_RATING_PENALTY = Decimal("0.50")

# "Clearly nowhere near" threshold for auto-confirming a reported no-show.
NO_SHOW_PROXIMITY_KM = 0.5

# How far around the target timestamp we'll accept a location ping as evidence.
LOCATION_LOOKUP_WINDOW_MIN = 30


# ── Customer cancellation-offense counter ─────────────────────────────────────

async def count_customer_offenses(db: AsyncSession, user_id: uuid.UUID) -> int:
    """
    Every prior CancellationPenalty row charged to this user as 'user'
    (late/repeat self-cancellations AND worker-flagged "customer
    unavailable" incidents), including $0/waived first-offense rows.
    """
    result = await db.execute(
        select(func.count(CancellationPenalty.id)).where(
            CancellationPenalty.charged_to == user_id,
            CancellationPenalty.charged_role == "user",
        )
    )
    return result.scalar() or 0


def cancellation_penalty_amount(job: Job, pct: Decimal) -> Decimal:
    base = job.final_price or job.quoted_price or job.budget_max or Decimal("0")
    return (Decimal(base) * pct).quantize(Decimal("0.01"))


async def record_customer_offense(
    db: AsyncSession,
    job: Job,
    user_id: uuid.UUID,
    reason: str,
    pct: Decimal,
) -> CancellationPenalty:
    """
    Log an offense against the counter used by count_customer_offenses.
    pct=0 means a forgiven/free occurrence — still logged (status='waived')
    so future counts are accurate. Collection of a non-zero amount is
    handled downstream by the existing payments/escrow flow, same as the
    pre-existing worker-cancellation penalty this mirrors.
    """
    amount = cancellation_penalty_amount(job, pct)
    penalty = CancellationPenalty(
        job_id=job.id,
        charged_to=user_id,
        charged_role="user",
        amount=amount,
        reason=reason[:100],
        status="waived" if pct == 0 else "pending",
    )
    db.add(penalty)
    return penalty


# ── Worker no-show offense counter + rating penalty ───────────────────────────

async def count_worker_no_shows(db: AsyncSession, worker_id: uuid.UUID) -> int:
    """Prior CONFIRMED no-shows against this worker (pending/rejected reports don't count)."""
    result = await db.execute(
        select(func.count(Job.id)).where(
            Job.worker_id == worker_id,
            Job.no_show_status == "confirmed",
        )
    )
    return result.scalar() or 0


async def recompute_worker_rating(db: AsyncSession, wp: WorkerProfile) -> None:
    """
    Recompute wp.avg_rating/rating_count from the reviews table, then apply
    any standing rating_penalty_total on top (floored at 0). Call this any
    time the raw review average OR the penalty total changes, so avg_rating
    never drifts out of sync with either input — a plain "recompute from
    reviews" would otherwise silently wipe out a no-show penalty the next
    time a review comes in.
    """
    agg_result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.worker_id == wp.id, Review.is_visible == True  # noqa: E712
        )
    )
    raw_avg, rating_count = agg_result.one()
    raw_avg = Decimal(str(raw_avg)) if raw_avg is not None else Decimal("0")
    wp.rating_count = rating_count or 0
    wp.avg_rating = max(Decimal("0"), raw_avg - (wp.rating_penalty_total or Decimal("0")))


async def apply_no_show_rating_penalty(db: AsyncSession, wp: WorkerProfile) -> bool:
    """
    Apply the flat -0.5 star no-show penalty, forgiving the worker's
    first-ever confirmed no-show. Returns True if a penalty was actually
    applied (False if forgiven). Caller must have already set
    Job.no_show_status='confirmed' on the triggering job BEFORE calling
    this, so count_worker_no_shows sees an accurate prior count.
    """
    prior = await count_worker_no_shows(db, wp.id)
    if prior <= 1:
        # <=1 because the triggering job itself was just marked 'confirmed'
        # by the caller and is included in this count — prior==1 means this
        # IS their first-ever confirmed no-show.
        return False
    wp.rating_penalty_total = (wp.rating_penalty_total or Decimal("0")) + NO_SHOW_RATING_PENALTY
    await recompute_worker_rating(db, wp)
    return True


# ── Arrival-time resolution ────────────────────────────────────────────────────

def get_arrival_datetime(job: Job) -> datetime | None:
    """
    Best-effort "when is/was the worker supposed to arrive" for a
    scheduled/discovery job. Returns None for jobs with no resolvable
    arrival time (e.g. pure instant jobs) — callers should treat that as
    "the time-based policy doesn't apply here".
    """
    if job.scheduled_at is not None:
        return job.scheduled_at
    if job.assigned_date is not None and job.window_start is not None:
        return datetime.combine(job.assigned_date, job.window_start, tzinfo=timezone.utc)
    if job.preferred_days and job.window_start is not None:
        try:
            d = date.fromisoformat(job.preferred_days[0])
        except (ValueError, TypeError):
            return None
        return datetime.combine(d, job.window_start, tzinfo=timezone.utc)
    return None


# ── GPS proximity check for no-show reports ────────────────────────────────────

def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dphi = math.radians(float(lat2) - float(lat1))
    dlambda = math.radians(float(lon2) - float(lon1))
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


async def find_worker_location_near(
    db: AsyncSession,
    worker_id: uuid.UUID,
    target_time: datetime,
    window_minutes: int = LOCATION_LOOKUP_WINDOW_MIN,
):
    """
    Best-effort location fix for `worker_id` closest to `target_time`.
    Looks in location_history first (append-only, timestamped pings, so it
    has an actual record of where the worker was); falls back to the live
    worker_locations row only if its updated_at itself falls inside the
    window — a stale "live" fix from hours later/earlier tells us nothing
    about where the worker was at arrival time. Returns None if there's no
    usable evidence.
    """
    lo = target_time - timedelta(minutes=window_minutes)
    hi = target_time + timedelta(minutes=window_minutes)

    hist_result = await db.execute(
        select(LocationHistory).where(
            LocationHistory.worker_id == worker_id,
            LocationHistory.recorded_at >= lo,
            LocationHistory.recorded_at <= hi,
        )
    )
    candidates = hist_result.scalars().all()
    if candidates:
        return min(candidates, key=lambda c: abs((c.recorded_at - target_time).total_seconds()))

    live_result = await db.execute(select(WorkerLocation).where(WorkerLocation.worker_id == worker_id))
    live = live_result.scalar_one_or_none()
    if live and lo <= live.updated_at <= hi:
        return live
    return None
