from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from database import get_db
from models import User, Job, Review
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
        select(Review)
        .where(Review.worker_id == worker_id, Review.is_visible == True)
        .order_by(Review.created_at.desc())
        .offset(offset).limit(limit)
    )
    return result.scalars().all()


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
