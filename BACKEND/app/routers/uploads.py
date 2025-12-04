from fastapi import APIRouter, Depends, UploadFile, File, Query
from uuid import UUID
from app.dependencies import require_db_user, require_worker
from app.services.storage import upload_file_to_supabase

router = APIRouter(tags=["Uploads"])

KYC_DOCS_BUCKET = "KYC_DOCS"
JOB_PROOF_BUCKET = "JOB_PROOF"
CHAT_MEDIA_BUCKET = "chat_media"
COMPLAINT_PROOF_BUCKET = "complaint_proof"

@router.post("/api/upload/kyc")
async def upload_kyc(file: UploadFile = File(...), user: dict = Depends(require_db_user)):
    url = await upload_file_to_supabase(KYC_DOCS_BUCKET, file, f"{user['id']}")
    return {"ok": True, "url": url}

@router.post("/api/upload/proof")
async def upload_proof(job_id: UUID = Query(...), file: UploadFile = File(...), user: dict = Depends(require_worker)):
    url = await upload_file_to_supabase(JOB_PROOF_BUCKET, file, f"{job_id}")
    return {"ok": True, "url": url}

@router.post("/api/upload/chat")
async def upload_chat(chat_id: UUID = Query(...), file: UploadFile = File(...), user: dict = Depends(require_db_user)):
    url = await upload_file_to_supabase(CHAT_MEDIA_BUCKET, file, f"{chat_id}")
    return {"ok": True, "url": url}

@router.post("/api/upload/complaint")
async def upload_complaint_evidence(
    job_id: UUID = Query(...), 
    file: UploadFile = File(...), 
    user: dict = Depends(require_db_user)
):
    """Uploads evidence for complaints"""
    url = await upload_file_to_supabase(COMPLAINT_PROOF_BUCKET, file, f"{job_id}/{user['id']}")
    return {"ok": True, "url": url}