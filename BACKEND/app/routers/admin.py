

from fastapi import APIRouter, Depends
from uuid import UUID
import asyncpg
from app.dependencies import get_db, require_admin
from app.models import AdminKycReview, AdminComplaintUpdate, AdminFlagUpdate

router = APIRouter(tags=["Admin"])

@router.get("/api/admin/kyc/pending")
async def admin_kyc_pending(user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    rows = await conn.fetch("SELECT kd.*, u.full_name, u.email FROM public.kyc_documents kd JOIN public.users u ON u.id = kd.user_id WHERE kd.status = 'pending'")
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.post("/api/admin/kyc/{doc_id}/review")
async def admin_kyc_review(doc_id: UUID, payload: AdminKycReview, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("UPDATE public.kyc_documents SET status=$1::public.kyc_status, rejection_reason=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4 RETURNING *", payload.status, payload.reason, user["id"], doc_id)
    return {"ok": True, "data": dict(row)}

@router.get("/api/admin/complaints")
async def admin_complaints(conn: asyncpg.Connection = Depends(get_db), user: dict = Depends(require_admin)):
    rows = await conn.fetch("SELECT * FROM public.complaints ORDER BY created_at DESC")
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.post("/api/admin/complaints/{id}")
async def admin_update_complaint(id: UUID, payload: AdminComplaintUpdate, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("UPDATE public.complaints SET status=$1::public.complaint_status, resolution_notes=$2, resolved_by=$3, resolved_at=now() WHERE id=$4 RETURNING *", payload.status, payload.resolution_notes, user["id"], id)
    return {"ok": True, "data": dict(row)}

@router.patch("/api/admin/users/{user_id}/flag")
async def admin_flag_user(user_id: UUID, payload: AdminFlagUpdate, user: dict = Depends(require_admin), conn: asyncpg.Connection = Depends(get_db)):
    await conn.execute("UPDATE public.users SET is_flagged=$1 WHERE id=$2", payload.is_flagged, user_id)
    await conn.execute("INSERT INTO public.governance_stats (user_id, is_flagged, flagged_reason) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET is_flagged=EXCLUDED.is_flagged", user_id, payload.is_flagged, payload.reason)
    return {"ok": True}