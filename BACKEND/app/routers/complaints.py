from fastapi import APIRouter, Depends, HTTPException
import asyncpg
from app.dependencies import get_db, require_db_user
from app.models import ComplaintCreate

router = APIRouter(tags=["Complaints"])

@router.post("/api/complaints")
async def create_complaint(
    payload: ComplaintCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    
    # Validate job relation if job_id is provided
    if payload.job_id:
        job = await conn.fetchrow("SELECT customer_id, worker_id FROM public.jobs WHERE id = $1", payload.job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        # Ensure reporter is part of the job
        if uid not in (job["customer_id"], job["worker_id"]):
             raise HTTPException(403, "You are not related to this job")
        
        # Auto-set target if not provided
        if not payload.target_user_id:
            payload.target_user_id = job["worker_id"] if uid == job["customer_id"] else job["customer_id"]

    row = await conn.fetchrow(
        """
        INSERT INTO public.complaints
          (reporter_id, target_user_id, job_id,
           complaint_type, severity_level,
           subject, description, evidence_files)
        VALUES (
          $1, $2, $3,
          $4::public.complaint_type, $5,
          $6, $7, $8
        )
        RETURNING *
        """,
        uid,
        payload.target_user_id,
        payload.job_id,
        payload.complaint_type,
        payload.severity_level,
        payload.subject,
        payload.description,
        payload.evidence_files or [],
    )
    
    # Trigger DB function for auto-flagging is handled by Postgres Triggers (if configured in schema)
    
    return {"ok": True, "data": dict(row)}