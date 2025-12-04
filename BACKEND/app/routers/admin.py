from fastapi import APIRouter, Depends, HTTPException, Query
from uuid import UUID
from typing import List, Optional
import asyncpg
from app.dependencies import get_db, require_admin
from app.models import AdminKycReview, AdminComplaintUpdate, AdminFlagUpdate

router = APIRouter(tags=["Admin"])

# --- USERS (New) ---
@router.get("/api/admin/users")
async def admin_list_users(
    search: Optional[str] = Query(None),
    conn: asyncpg.Connection = Depends(get_db),
    user: dict = Depends(require_admin)
):
    """
    List users for admin management with search.
    """
    base_query = "SELECT * FROM public.users"
    params = []
    
    if search:
        base_query += " WHERE full_name ILIKE $1 OR email ILIKE $1"
        params.append(f"%{search}%")
    
    base_query += " ORDER BY created_at DESC LIMIT 50"
    
    rows = await conn.fetch(base_query, *params)
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.patch("/api/admin/users/{user_id}/flag")
async def admin_flag_user(
    user_id: UUID, 
    payload: AdminFlagUpdate, 
    user: dict = Depends(require_admin), 
    conn: asyncpg.Connection = Depends(get_db)
):
    # Update User Table
    await conn.execute("UPDATE public.users SET is_flagged=$1 WHERE id=$2", payload.is_flagged, user_id)
    
    # Update Governance Stats
    await conn.execute(
        """
        INSERT INTO public.governance_stats (user_id, is_flagged, flagged_reason, last_flagged_at) 
        VALUES ($1, $2, $3, now()) 
        ON CONFLICT (user_id) DO UPDATE SET 
            is_flagged=EXCLUDED.is_flagged, 
            flagged_reason=EXCLUDED.flagged_reason,
            last_flagged_at=now()
        """, 
        user_id, payload.is_flagged, payload.reason
    )
    return {"ok": True}

# --- KYC ---
@router.get("/api/admin/kyc/pending")
async def admin_kyc_pending(user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    rows = await conn.fetch("SELECT kd.*, u.full_name, u.email FROM public.kyc_documents kd JOIN public.users u ON u.id = kd.user_id WHERE kd.status = 'pending'")
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.post("/api/admin/kyc/{doc_id}/review")
async def admin_kyc_review(doc_id: UUID, payload: AdminKycReview, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow(
        "UPDATE public.kyc_documents SET status=$1::public.kyc_status, rejection_reason=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4 RETURNING *", 
        payload.status, payload.reason, user["id"], doc_id
    )
    if not row: raise HTTPException(404, "Document not found")

    if payload.status == 'verified':
        await conn.execute("UPDATE public.worker_profiles SET kyc_status = 'verified', kyc_verified_at = now(), kyc_verified_by = $2 WHERE user_id = $1", row['user_id'], user['id'])
    elif payload.status == 'rejected':
        await conn.execute("UPDATE public.worker_profiles SET kyc_status = 'rejected' WHERE user_id = $1", row['user_id'])

    return {"ok": True, "data": dict(row)}

# --- COMPLAINTS ---
@router.get("/api/admin/complaints")
async def admin_complaints(conn: asyncpg.Connection = Depends(get_db), user: dict = Depends(require_admin)):
    rows = await conn.fetch("""
        SELECT 
            c.*, 
            r.full_name as reporter_name, 
            r.email as reporter_email,
            t.full_name as target_name, 
            t.email as target_email,
            j.title as job_title
        FROM public.complaints c
        LEFT JOIN public.users r ON r.id = c.reporter_id
        LEFT JOIN public.users t ON t.id = c.target_user_id
        LEFT JOIN public.jobs j ON j.id = c.job_id
        ORDER BY 
            CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END,
            c.created_at DESC
    """)
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.patch("/api/admin/complaints/{id}/resolve")
async def admin_resolve_complaint(
    id: UUID, 
    payload: AdminComplaintUpdate, 
    user: dict = Depends(require_admin), 
    conn: asyncpg.Connection = Depends(get_db)
):
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            UPDATE public.complaints 
            SET status=$1::public.complaint_status, resolution_notes=$2, resolved_by=$3, resolved_at=now() 
            WHERE id=$4 
            RETURNING *
            """, 
            payload.status, payload.resolution_notes, user["id"], id
        )
        if not row: raise HTTPException(404, "Complaint not found")
        
        target_id = row['target_user_id']

        if payload.status == 'resolved_banned' and target_id:
            await conn.execute("UPDATE public.users SET is_flagged = true WHERE id = $1", target_id)
            await conn.execute(
                """
                INSERT INTO public.governance_stats (user_id, is_flagged, flagged_reason, last_flagged_at)
                VALUES ($1, true, $2, now())
                ON CONFLICT (user_id) DO UPDATE SET 
                    is_flagged = true, 
                    flagged_reason = EXCLUDED.flagged_reason,
                    last_flagged_at = now()
                """,
                target_id, f"Banned via Complaint Resolution: {payload.resolution_notes}"
            )

    return {"ok": True, "data": dict(row)}

# --- JOBS ---
@router.get("/api/admin/jobs")
async def admin_list_jobs(conn: asyncpg.Connection = Depends(get_db), user: dict = Depends(require_admin)):
    rows = await conn.fetch("""
        SELECT 
            j.id, j.title, j.budget_max_cents, j.status, j.created_at,
            u.full_name as customer_name, u.email as customer_email
        FROM public.jobs j
        LEFT JOIN public.users u ON u.id = j.customer_id
        ORDER BY j.created_at DESC
        LIMIT 100
    """)
    return {"ok": True, "data": [dict(r) for r in rows]}

# --- DASHBOARD ---
@router.get("/api/admin/dashboard")
async def admin_dashboard(conn: asyncpg.Connection = Depends(get_db), user: dict = Depends(require_admin)):
    total_users = await conn.fetchval("SELECT COUNT(*) FROM public.users")
    pending_kyc = await conn.fetchval("SELECT COUNT(*) FROM public.kyc_documents WHERE status = 'pending'")
    active_complaints = await conn.fetchval("SELECT COUNT(*) FROM public.complaints WHERE status IN ('pending', 'investigating')")
    active_jobs = await conn.fetchval("SELECT COUNT(*) FROM public.jobs WHERE status IN ('open', 'bidding', 'in_progress')")

    recent_users = await conn.fetch("SELECT id, full_name, email, role, created_at FROM public.users ORDER BY created_at DESC LIMIT 5")
    recent_jobs = await conn.fetch("SELECT id, title, budget_max_cents, status, created_at FROM public.jobs ORDER BY created_at DESC LIMIT 5")

    return {
        "ok": True,
        "data": {
            "stats": { "totalUsers": total_users, "pendingKYC": pending_kyc, "activeComplaints": active_complaints, "activeJobs": active_jobs },
            "recentUsers": [dict(r) for r in recent_users],
            "recentJobs": [dict(r) for r in recent_jobs]
        }
    }