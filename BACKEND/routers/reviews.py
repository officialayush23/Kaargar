from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import uuid

from database import get_db
from models import User, Job, Review, WorkerProfile, Service
from schemas import ReviewCreate, ReviewResponse, ReviewReply, SuccessResponse
from dependencies import get_current_user

router = APIRouter()


@router.post("", response_model=ReviewResponse)
async def create_review(
    body: ReviewCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    job_result = await db.execute(
        select(Job).where(Job.id == body.job_id, Job.user_id == user.id, Job.status == "completed")
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(400, "Can only review completed jobs")
    if not job.worker_id:
        raise HTTPException(400, "No worker assigned")

    existing = await db.execute(select(Review).where(Review.job_id == body.job_id))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Review already submitted")

    review = Review(
        job_id=body.job_id,
        reviewer_id=user.id,
        worker_id=job.worker_id,
        service_id=job.service_id,
        rating=body.rating,
        quality_rating=body.quality_rating,
        punctuality_rating=body.punctuality_rating,
        communication_rating=body.communication_rating,
        value_rating=body.value_rating,
        text=body.text,
        photos=body.photos or [],
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    setattr(review, "reviewer_name", user.full_name)

    wp_result = await db.execute(
        select(WorkerProfile).where(WorkerProfile.id == job.worker_id)
    )
    wp = wp_result.scalar_one_or_none()
    if wp:
        # Shared helper — recomputes the raw review average AND re-applies
        # any standing no-show rating_penalty_total on top, so that penalty
        # doesn't get silently wiped out by this recompute.
        from services.penalties import recompute_worker_rating
        await recompute_worker_rating(db, wp)
        await db.commit()

    # ── Service-level rating aggregation ───────────────────────────────────────
    # Separate from WorkerProfile.avg_rating above — this rolls the review up
    # into the specific Service that was booked (when the job/review has one),
    # so a worker's per-service ratings can differ from their overall rating.
    if review.service_id:
        svc_result = await db.execute(
            select(Service).where(Service.id == review.service_id)
        )
        svc = svc_result.scalar_one_or_none()
        if svc:
            svc_agg_result = await db.execute(
                select(func.avg(Review.rating), func.count(Review.id))
                .where(Review.service_id == review.service_id, Review.is_visible == True)  # noqa: E712
            )
            svc_avg_rating, svc_rating_count = svc_agg_result.one()
            svc.avg_rating = svc_avg_rating or 0
            svc.rating_count = svc_rating_count or 0
            await db.commit()

    return review


@router.get("/worker/{worker_id}", response_model=list[ReviewResponse])
async def worker_reviews(
    worker_id: uuid.UUID,
    page: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    limit = 20
    offset = (page - 1) * limit
    result = await db.execute(
        select(Review, User.full_name)
        .join(User, User.id == Review.reviewer_id)
        .where(Review.worker_id == worker_id, Review.is_visible == True)
        .order_by(Review.created_at.desc())
        .offset(offset).limit(limit)
    )
    rows = result.all()
    return [
        ReviewResponse(
            id=review.id,
            job_id=review.job_id,
            reviewer_id=review.reviewer_id,
            worker_id=review.worker_id,
            reviewer_name=reviewer_name,
            rating=review.rating,
            text=review.text,
            reply=review.reply,
            created_at=review.created_at,
        )
        for review, reviewer_name in rows
    ]


@router.post("/{review_id}/reply", response_model=ReviewResponse)
async def reply_to_review(
    review_id: uuid.UUID,
    body: ReviewReply,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from models import WorkerProfile
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(403)

    result = await db.execute(
        select(Review).where(Review.id == review_id, Review.worker_id == wp.id)
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(404)

    from datetime import datetime, timezone
    review.reply = body.reply
    review.reply_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(review)
    return review
