from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
import asyncpg
from app.dependencies import get_db, require_db_user
from app.models import RatingCreate

router = APIRouter(tags=["Ratings"])

@router.get("/api/ratings/{target_id}")
async def list_ratings_for_user(
    target_id: UUID,
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Public listing of ratings for a specific worker/user.
    """
    rows = await conn.fetch(
        """
        SELECT 
          r.id, r.job_id, r.reviewer_id, r.target_id, r.rating, r.comment, r.created_at,
          u.full_name as reviewer_name, u.avatar_url as reviewer_avatar
        FROM public.ratings r
        JOIN public.users u ON u.id = r.reviewer_id
        WHERE r.target_id = $1
        ORDER BY r.created_at DESC
        LIMIT 50
        """,
        target_id,
    )
    return {"ok": True, "reviews": [dict(r) for r in rows]}

@router.post("/api/ratings")
async def create_rating(
    payload: RatingCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Manually add a rating (Useful for testing or ad-hoc reviews).
    """
    if payload.target_id == user["id"]:
        raise HTTPException(400, "Cannot rate yourself")

    row = await conn.fetchrow(
        """
        INSERT INTO public.ratings (job_id, reviewer_id, target_id, rating, comment)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        payload.job_id,
        user["id"],
        payload.target_id,
        payload.rating,
        payload.comment,
    )
    return {"ok": True, "data": dict(row)}