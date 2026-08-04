"""
Cancellation reasons + the worker penalty-due ledger.

See docs/cancellation-rules.md in the mobile repo for the full policy matrix.
This module owns two things:

  1. the fixed reason vocabulary for pre-assignment Instant cancellations
  2. the "first two are free, then you owe the base fare" worker penalty logic
"""

import logging
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import PenaltyDue, User, WorkerProfile

logger = logging.getLogger(__name__)

# How many assigned-job cancellations a worker gets before money is charged.
# The worker is TOLD how many remain — a silent grace period teaches nothing
# and the third one then feels arbitrary.
FREE_CANCELLATIONS = 2


# ── Instant pre-assignment cancellation reasons ───────────────────────────────
# Fixed vocabulary, Rapido-style. `other` is the only one that requires text.
# Kept short on purpose: a long list gets scrolled past and everyone taps the
# first option, which produces worse data than four honest choices.
CANCEL_REASON_CODES: dict[str, str] = {
    "taking_too_long":  "Taking too long to find a worker",
    "booked_by_mistake": "Booked by mistake",
    "found_alternative": "Found someone else",
    "price_too_high":   "Price is too high",
    "wrong_service":    "Selected the wrong service",
    "wrong_address":    "Wrong address",
    "no_longer_needed": "No longer needed",
    "other":            "Other",
}


def is_valid_reason_code(code: str) -> bool:
    return code in CANCEL_REASON_CODES


def _normalise(value: str | None) -> str:
    return (value or "").strip().lower()


async def outstanding_dues(db: AsyncSession, user: User) -> list[PenaltyDue]:
    """
    Everything this PERSON currently owes, matched on phone OR email rather
    than on the account id.

    OR, not AND, and deliberately so: someone who re-registers usually keeps
    one of the two and changes the other. Requiring both to match would let a
    single changed field clear the slate, which defeats the point.
    """
    phone = _normalise(user.phone)
    email = _normalise(user.email)
    if not phone and not email:
        return []

    conditions = []
    if phone:
        conditions.append(func.lower(PenaltyDue.phone) == phone)
    if email:
        conditions.append(func.lower(PenaltyDue.email) == email)

    from sqlalchemy import or_
    rows = (await db.execute(
        select(PenaltyDue)
        .where(PenaltyDue.status == "pending")
        .where(or_(*conditions))
        .order_by(PenaltyDue.created_at.asc())
    )).scalars().all()
    return list(rows)


async def outstanding_total(db: AsyncSession, user: User) -> Decimal:
    dues = await outstanding_dues(db, user)
    return sum((d.amount for d in dues), Decimal("0"))


async def count_prior_worker_cancellations(db: AsyncSession, wp: WorkerProfile) -> int:
    """
    How many assigned-job cancellations this worker has already had charged or
    forgiven. Counts CancellationPenalty rows, which is where the existing
    cancel path already records them — so the grace counter and the historical
    record can't disagree.
    """
    from models import CancellationPenalty

    return int((await db.execute(
        select(func.count(CancellationPenalty.id))
        .where(CancellationPenalty.charged_role == "worker")
        .where(CancellationPenalty.charged_to == wp.user_id)
    )).scalar() or 0)


async def apply_worker_cancellation_penalty(
    db: AsyncSession,
    wp: WorkerProfile,
    user: User,
    job,
) -> dict:
    """
    Charge (or forgive) a worker cancelling a job they'd already accepted.

    Returns a dict the caller can put straight in the response so the app can
    tell the worker where they stand:
        {charged: bool, amount: Decimal, free_remaining: int, total_owed: Decimal}

    The amount is the job's BASE FARE (`quoted_price`) — not `approved_total`,
    which would include extra items the worker never got to buy, and not a flat
    fee, which under-punishes an abandoned ₹2000 job and over-punishes a ₹200
    one.

    Does not commit; the caller owns the transaction.
    """
    prior = await count_prior_worker_cancellations(db, wp)
    free_remaining_before = max(0, FREE_CANCELLATIONS - prior)

    if free_remaining_before > 0:
        # Forgiven — but still recorded, so the count is real.
        logger.info(
            "Worker %s cancellation forgiven (%d of %d free used)",
            wp.id, prior + 1, FREE_CANCELLATIONS,
        )
        return {
            "charged": False,
            "amount": Decimal("0"),
            "free_remaining": free_remaining_before - 1,
            "total_owed": await outstanding_total(db, user),
        }

    amount = Decimal(str(job.quoted_price or 0))
    if amount <= 0:
        # Nothing sensible to charge. Don't invent a number.
        logger.warning(
            "Worker %s cancelled job %s with no quoted_price — no due raised",
            wp.id, job.id,
        )
        return {
            "charged": False,
            "amount": Decimal("0"),
            "free_remaining": 0,
            "total_owed": await outstanding_total(db, user),
        }

    db.add(PenaltyDue(
        worker_id=wp.id,
        user_id=user.id,
        # Normalised at write time so the lookup above matches reliably.
        phone=_normalise(user.phone),
        email=_normalise(user.email),
        job_id=job.id,
        amount=amount,
        reason=f"Cancelled an accepted job (base fare ₹{amount})",
        status="pending",
    ))

    return {
        "charged": True,
        "amount": amount,
        "free_remaining": 0,
        "total_owed": (await outstanding_total(db, user)) + amount,
    }


async def settle_dues_against_payout(
    db: AsyncSession,
    user: User,
    job,
    payout_amount: Decimal,
) -> Decimal:
    """
    Deduct outstanding dues from a payout, oldest first. Returns what's left to
    actually pay the worker.

    Partial settlement is deliberately NOT supported: a due is either fully
    covered by this payout or left pending for the next one. Splitting a single
    debt across payouts means tracking a remaining balance per row, and every
    dispute then needs the whole chain reconstructed. Leaving a ₹500 due
    untouched by a ₹300 payout is simpler and honest — the worker keeps the
    ₹300 and still owes ₹500.

    Does not commit; caller owns the transaction.
    """
    remaining = Decimal(str(payout_amount or 0))
    if remaining <= 0:
        return remaining

    for due in await outstanding_dues(db, user):
        if due.amount > remaining:
            break
        from datetime import datetime, timezone
        due.status = "settled"
        due.settled_against_job_id = job.id if job is not None else None
        due.settled_at = datetime.now(timezone.utc)
        remaining -= due.amount
        logger.info("Settled penalty due %s (₹%s) against job %s", due.id, due.amount, getattr(job, "id", None))

    return remaining
