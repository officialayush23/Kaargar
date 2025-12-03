
import json
import redis.asyncio as redis
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg
from app.dependencies import get_db, require_db_user, require_worker, get_redis
from app.models import (
    JobCreate, BookJobRequest, JobStatusUpdate, BidCreate, HireRequest, 
    JobProofSubmit, JobProofApprove
)

router = APIRouter(tags=["Jobs & Marketplace"])

# --- Helper: Publish Notification ---
async def notify(r: redis.Redis, user_id: UUID, event_type: str, payload: dict):
    if r:
        await r.publish(f"notifications:{user_id}", json.dumps({"type": event_type, **payload}))

# --- Endpoints ---

@router.post("/api/jobs")
async def create_job(
    payload: JobCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    loc_expr = "NULL"
    params = [uid]
    idx = 2
    
    if not payload.is_remote and payload.lat and payload.lon:
        loc_expr = f"ST_SetSRID(ST_MakePoint(${idx+1}, ${idx})::geography, 4326)"
        params.extend([payload.lat, payload.lon])
        idx += 2
        
    query = f"""
    INSERT INTO public.jobs (
      customer_id, title, description, category, profession_required, services_required,
      job_location, is_remote, budget_min_cents, budget_max_cents, price_type,
      address_text, city, pincode
    ) VALUES (
      $1, ${idx}, ${idx+1}, ${idx+2}, ${idx+3}, ${idx+4},
      {loc_expr}, ${idx+5}, ${idx+6}, ${idx+7}, ${idx+8}::public.price_type,
      ${idx+9}, ${idx+10}, ${idx+11}
    ) RETURNING *;
    """
    params.extend([
        payload.title, payload.description, payload.category, payload.profession_required,
        payload.services_required or [], payload.is_remote, payload.budget_min_cents,
        payload.budget_max_cents, payload.price_type, payload.address_text,
        payload.city, payload.pincode
    ])
    
    row = await conn.fetchrow(query, *params)
    return {"ok": True, "data": dict(row)}

@router.post("/api/jobs/book")
async def book_job(
    payload: BookJobRequest,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    customer_id = user["id"]
    jd = payload.job_details

    # 1. Check Worker
    worker = await conn.fetchrow(
        """
        SELECT u.id, wp.accepts_direct_hire, wp.is_online, wp.kyc_status, u.role
        FROM public.users u
        JOIN public.worker_profiles wp ON wp.user_id = u.id
        WHERE u.id = $1
        """,
        payload.worker_id
    )
    if not worker: raise HTTPException(404, "Worker not found")
    if worker["role"] != "worker" or worker["kyc_status"] != "verified":
        raise HTTPException(400, "Worker unavailable/unverified")

    # 2. Create Job
    loc_expr = "NULL"
    params = [customer_id]
    idx = 2
    if not jd.is_remote and jd.lat and jd.lon:
        loc_expr = f"ST_SetSRID(ST_MakePoint(${idx+1}, ${idx})::geography, 4326)"
        params.extend([jd.lat, jd.lon])
        idx += 2
        
    query = f"""
    INSERT INTO public.jobs (
      customer_id, title, description, category, profession_required, services_required,
      job_location, is_remote, budget_min_cents, budget_max_cents, price_type,
      address_text, city, pincode
    ) VALUES (
      $1, ${idx}, ${idx+1}, ${idx+2}, ${idx+3}, ${idx+4},
      {loc_expr}, ${idx+5}, ${idx+6}, ${idx+7}, ${idx+8}::public.price_type,
      ${idx+9}, ${idx+10}, ${idx+11}
    ) RETURNING id
    """
    params.extend([
        jd.title, jd.description, jd.category, jd.profession_required,
        jd.services_required or [], jd.is_remote, jd.budget_min_cents,
        jd.budget_max_cents, jd.price_type, jd.address_text,
        jd.city, jd.pincode
    ])
    job_row = await conn.fetchrow(query, *params)
    job_id = job_row["id"]

    # 3. Direct Hire Logic
    is_direct = worker["accepts_direct_hire"] and worker["is_online"]
    
    if is_direct:
        await conn.execute("UPDATE public.jobs SET worker_id = $1, status = 'assigned' WHERE id = $2", payload.worker_id, job_id)
        msg_type = "direct_hire"
        msg = f"New Direct Job: {jd.title}"
    else:
        await conn.execute("UPDATE public.jobs SET requested_worker_id = $1, status = 'requested' WHERE id = $2", payload.worker_id, job_id)
        msg_type = "job_request"
        msg = f"New Job Request: {jd.title}"

    if r:
        await notify(r, payload.worker_id, msg_type, {"job_id": str(job_id), "message": msg})

    return {"ok": True, "job_id": str(job_id), "type": "direct" if is_direct else "request"}

@router.get("/api/jobs/{job_id}")
async def get_job(job_id: UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("SELECT j.*, u.full_name AS customer_name FROM public.jobs j JOIN public.users u ON u.id = j.customer_id WHERE j.id = $1", job_id)
    if not row: raise HTTPException(404, "Job not found")
    return {"ok": True, "data": dict(row)}

@router.patch("/api/jobs/{job_id}/status")
async def update_job_status(job_id: UUID, payload: JobStatusUpdate, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("UPDATE public.jobs SET status = $1::public.job_status WHERE id = $2 AND customer_id = $3 RETURNING *", payload.status, job_id, user["id"])
    if not row: raise HTTPException(404, "Job not found or not yours")
    return {"ok": True, "data": dict(row)}

@router.delete("/api/jobs/{job_id}")
async def delete_job(job_id: UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    res = await conn.execute("DELETE FROM public.jobs WHERE id = $1 AND customer_id = $2 AND status IN ('open', 'bidding', 'draft')", job_id, user["id"])
    if res == "DELETE 0": raise HTTPException(400, "Cannot delete job")
    return {"ok": True}

# --- Bids ---

@router.get("/api/jobs/{job_id}/bids")
async def list_bids(job_id: UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    job = await conn.fetchrow("SELECT customer_id FROM public.jobs WHERE id = $1", job_id)
    if not job: raise HTTPException(404, "Job not found")
    
    rows = await conn.fetch(
        """
        SELECT b.id, b.amount_cents, b.message, b.created_at, b.status,
               u.id as worker_id, u.full_name, u.avatar_url,
               wp.skills, wp.professions, wp.experience_years,
               COALESCE(gs.rating_avg, 0) as rating, COALESCE(gs.rating_count, 0) as reviews
        FROM public.bids b
        JOIN public.users u ON u.id = b.worker_id
        JOIN public.worker_profiles wp ON wp.user_id = b.worker_id
        LEFT JOIN public.governance_stats gs ON gs.user_id = b.worker_id
        WHERE b.job_id = $1 ORDER BY b.amount_cents ASC
        """, job_id
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.post("/api/jobs/{job_id}/bids")
async def place_bid(
    job_id: UUID,
    payload: BidCreate,
    worker: dict = Depends(require_worker),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    worker_id = worker["id"]
    job = await conn.fetchrow(
        "SELECT j.status, j.customer_id, j.budget_max_cents, j.price_type, j.title, w.balance_cents FROM public.jobs j JOIN public.wallets w ON w.user_id = j.customer_id WHERE j.id = $1",
        job_id
    )
    if not job or job["status"] not in ("open", "bidding"): raise HTTPException(400, "Job not open")

    auto_accept = False
    if (job["price_type"] == "fixed" and job["budget_max_cents"] is not None and 
        payload.amount_cents <= job["budget_max_cents"] and job["balance_cents"] >= payload.amount_cents):
        auto_accept = True
    
    status_to_set = 'accepted' if auto_accept else 'pending'

    async with conn.transaction():
        bid = await conn.fetchrow(
            "INSERT INTO public.bids (job_id, worker_id, amount_cents, message, status) VALUES ($1, $2, $3, $4, $5) RETURNING id",
            job_id, worker_id, payload.amount_cents, payload.message, status_to_set
        )
        
        if auto_accept:
            await conn.execute("UPDATE public.jobs SET worker_id = $1, status = 'assigned' WHERE id = $2", worker_id, job_id)
            await conn.execute("UPDATE public.wallets SET balance_cents = balance_cents - $1, escrow_cents = escrow_cents + $1 WHERE user_id = $2", payload.amount_cents, job["customer_id"])
            await conn.execute("INSERT INTO public.payments (job_id, payer_id, payee_id, amount_cents, status) VALUES ($1, $2, $3, $4, 'held_in_escrow')", job_id, job["customer_id"], worker_id, payload.amount_cents)
            await conn.execute("INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, related_job_id) VALUES ($1, $2, 'job_payment', 'Auto-accepted bid escrow', $3)", job["customer_id"], -payload.amount_cents, job_id)

    if r:
        msg = f"Job auto-assigned" if auto_accept else f"New bid: {payload.amount_cents/100}"
        await notify(r, job["customer_id"], "bid", {"job_id": str(job_id), "message": msg})

    return {"ok": True, "bid_id": str(bid["id"]), "auto_accepted": auto_accept}

@router.post("/api/jobs/hire")
async def hire_worker(
    payload: HireRequest,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    uid = user["id"]
    data = await conn.fetchrow(
        "SELECT j.status, j.title, b.worker_id, b.amount_cents, w.balance_cents FROM public.jobs j JOIN public.bids b ON b.id = $2 JOIN public.wallets w ON w.user_id = j.customer_id WHERE j.id = $1 AND j.customer_id = $3",
        payload.job_id, payload.bid_id, uid
    )
    if not data or data["status"] not in ("open", "bidding"): raise HTTPException(400, "Invalid Job/Bid")
    if data["balance_cents"] < data["amount_cents"]: raise HTTPException(402, "Insufficient funds")

    async with conn.transaction():
        await conn.execute("UPDATE public.bids SET status = 'accepted' WHERE id = $1", payload.bid_id)
        await conn.execute("UPDATE public.jobs SET worker_id = $1, status = 'assigned' WHERE id = $2", data["worker_id"], payload.job_id)
        await conn.execute("UPDATE public.wallets SET balance_cents = balance_cents - $1, escrow_cents = escrow_cents + $1 WHERE user_id = $2", data["amount_cents"], uid)
        await conn.execute("INSERT INTO public.payments (job_id, payer_id, payee_id, amount_cents, status) VALUES ($1, $2, $3, $4, 'held_in_escrow')", payload.job_id, uid, data["worker_id"], data["amount_cents"])
        await conn.execute("INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, related_job_id) VALUES ($1, $2, 'job_payment', 'Escrow Lock', $3)", uid, -data["amount_cents"], payload.job_id)

    if r:
        await notify(r, data["worker_id"], "hired", {"job_id": str(payload.job_id), "message": f"Hired for {data['title']}"})

    return {"ok": True, "status": "assigned"}

# --- Job Execution ---

@router.post("/api/jobs/{job_id}/submit_work")
async def submit_work(
    job_id: UUID,
    payload: JobProofSubmit,
    worker: dict = Depends(require_worker),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    job = await conn.fetchrow("SELECT status, worker_id, customer_id, title FROM public.jobs WHERE id = $1", job_id)
    if not job or job["worker_id"] != worker["id"]: raise HTTPException(403, "Not your job")
    if job["status"] not in ("assigned", "in_progress"): raise HTTPException(400, "Job not active")

    async with conn.transaction():
        await conn.execute(
            """
            INSERT INTO public.job_proofs (job_id, worker_proof_imgs, worker_comment, bill_details, worker_submitted_at)
            VALUES ($1, $2, $3, $4::jsonb, now())
            ON CONFLICT (job_id) DO UPDATE SET worker_proof_imgs = EXCLUDED.worker_proof_imgs, worker_comment = EXCLUDED.worker_comment, bill_details = EXCLUDED.bill_details, worker_submitted_at = now()
            """,
            job_id, payload.worker_proof_imgs, payload.worker_comment, json.dumps(payload.bill_details)
        )
        await conn.execute("UPDATE public.jobs SET status = 'pending_acceptance' WHERE id = $1", job_id)

    if r:
        await notify(r, job["customer_id"], "work_submitted", {"job_id": str(job_id), "message": f"Work submitted for {job['title']}"})
        
    return {"ok": True}

@router.post("/api/jobs/{job_id}/approve_work")
async def approve_work(
    job_id: UUID,
    payload: JobProofApprove,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis),
):
    job = await conn.fetchrow("SELECT worker_id, customer_id, status, title FROM public.jobs WHERE id = $1", job_id)
    if job["customer_id"] != user["id"] or job["status"] != "pending_acceptance": raise HTTPException(400, "Invalid state")

    async with conn.transaction():
        await conn.execute("UPDATE public.job_proofs SET customer_approved=true, customer_comment=$1, customer_acted_at=now() WHERE job_id=$2", payload.customer_comment, job_id)
        await conn.execute("UPDATE public.jobs SET status='completed' WHERE id=$1", job_id)
        await conn.execute("INSERT INTO public.ratings (job_id, reviewer_id, target_id, rating, comment) VALUES ($1, $2, $3, $4, $5)", job_id, user["id"], job["worker_id"], payload.rating, payload.customer_comment)
        
        payment = await conn.fetchrow("SELECT id, amount_cents FROM public.payments WHERE job_id=$1 AND status='held_in_escrow'", job_id)
        if payment:
            amount = payment["amount_cents"]
            await conn.execute("UPDATE public.payments SET status='released' WHERE id=$1", payment["id"])
            await conn.execute("UPDATE public.wallets SET balance_cents = balance_cents + $1, updated_at=now() WHERE user_id=$2", amount, job["worker_id"])
            await conn.execute("UPDATE public.wallets SET escrow_cents = escrow_cents - $1 WHERE user_id=$2", amount, user["id"])
            await conn.execute("INSERT INTO public.wallet_transactions (user_id, amount_cents, type, description, related_job_id) VALUES ($1, $2, 'job_payment', 'Job Payment Received', $3)", job["worker_id"], amount, job_id)

    if r:
        await notify(r, job["worker_id"], "payment_received", {"job_id": str(job_id), "message": f"Payment released for {job['title']}"})

    return {"ok": True}




