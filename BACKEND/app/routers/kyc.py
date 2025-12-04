from fastapi import APIRouter, Depends, HTTPException
import asyncpg
from app.dependencies import get_db, require_db_user
from app.models import KycDocCreate

router = APIRouter(tags=["KYC"])

@router.get("/api/kyc")
async def get_kyc(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    docs = await conn.fetch(
        """
        SELECT id, doc_type, doc_subtype, storage_path, status, uploaded_at
        FROM public.kyc_documents
        WHERE user_id = $1
        ORDER BY uploaded_at DESC
        """,
        uid,
    )
    wp = await conn.fetchrow(
        "SELECT kyc_status, kyc_verified_at FROM public.worker_profiles WHERE user_id = $1",
        uid,
    )
    return {
        "ok": True,
        "data": {
            "kyc_status": wp["kyc_status"] if wp else "none",
            "kyc_verified_at": wp["kyc_verified_at"] if wp else None,
            "documents": [dict(r) for r in docs],
        },
    }

@router.post("/api/kyc")
async def create_kyc_doc(
    payload: KycDocCreate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    
    # 1. Insert Document
    row = await conn.fetchrow(
        """
        INSERT INTO public.kyc_documents
          (user_id, doc_type, doc_subtype, storage_path, doc_number, status)
        VALUES ($1, $2::public.kyc_doc_type, $3, $4, $5, 'pending')
        RETURNING *
        """,
        uid,
        payload.doc_type,
        payload.doc_subtype,
        payload.storage_path,
        payload.doc_number,
    )
    
    # 2. Update Worker Profile status to 'pending' if it was 'none' or 'rejected'
    await conn.execute(
        """
        UPDATE public.worker_profiles 
        SET kyc_status = 'pending' 
        WHERE user_id = $1 AND kyc_status IN ('none', 'rejected')
        """,
        uid
    )
    
    return {"ok": True, "data": dict(row)}