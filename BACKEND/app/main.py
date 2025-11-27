# app/main.py
import os
import json
import logging
import asyncpg
from typing import Optional, List, Any, Dict
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, Query, Path
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi

from app.auth import verify_and_decode_jwt, is_admin_token

# --- CONFIG ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn")
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL: raise RuntimeError("DATABASE_URL missing")

app = FastAPI(title="KAARGAR API FINAL", version="3.0.0")

# CORS
origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=True, 
    allow_methods=["*"], allow_headers=["*"]
)

# --- DB LIFECYCLE ---
@app.on_event("startup")
async def startup():
    app.state.db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)

@app.on_event("shutdown")
async def shutdown():
    await app.state.db_pool.close()

# --- SECURITY ---
security = HTTPBearer()
async def require_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    return verify_and_decode_jwt(creds.credentials)

# --- PYDANTIC MODELS ---
class ProfileCreate(BaseModel):
    role: str # 'customer', 'worker'
    # If worker:
    worker_type: Optional[str] = "individual" 
    professions: Optional[List[str]] = []
    hourly_rate_cents: Optional[int] = 0

class KycUpload(BaseModel):
    doc_type: str # 'aadhar', 'pan'
    storage_path: str # Path returned from Supabase Storage

class JobProofSubmit(BaseModel):
    photos: List[str]
    comment: str

class ChatMessage(BaseModel):
    content: str

class DeviceToken(BaseModel):
    token: str
    device_type: str = "android"

# ==================================================================
#                       1. PROFILE & ONBOARDING
# ==================================================================

@app.post("/api/profiles/onboard")
async def create_profile(payload: ProfileCreate, token = Depends(require_user)):
    """
    User chooses: "I want to be a Worker" or "Customer".
    """
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        # 1. Update Role in Users Table
        await conn.execute("UPDATE public.users SET role = $1::user_role WHERE id = $2", payload.role, uid)
        
        # 2. If Worker, create Worker Profile
        if payload.role == 'worker':
            await conn.execute("""
                INSERT INTO public.worker_profiles (user_id, worker_type, professions, hourly_rate_cents)
                VALUES ($1, $2::worker_type, $3, $4)
                ON CONFLICT (user_id) DO UPDATE 
                SET professions = $3, hourly_rate_cents = $4
            """, uid, payload.worker_type, payload.professions, payload.hourly_rate_cents)
            
            # Create a Wallet for them
            await conn.execute("INSERT INTO public.wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", uid)

    return {"ok": True, "message": f"Profile upgraded to {payload.role}"}

# ==================================================================
#                       2. KYC & COMPLIANCE
# ==================================================================

@app.post("/api/kyc")
async def upload_kyc_record(payload: KycUpload, token = Depends(require_user)):
    """
    Frontend uploads file to Supabase Storage -> Sends path here.
    """
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.kyc_documents (user_id, doc_type, storage_path, status)
            VALUES ($1, $2, $3, 'pending')
        """, uid, payload.doc_type, payload.storage_path)
    return {"ok": True, "msg": "KYC submitted for review"}

# ==================================================================
#                       3. JOB FLOW (Post -> Bid -> Assign)
# ==================================================================

# ... (Previous create_job and search_jobs endpoints go here, same as before) ...

@app.get("/api/jobs/{job_id}/bids")
async def get_job_bids(job_id: str, token = Depends(require_user)):
    """
    Customer views who bid on their job.
    """
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT b.*, u.full_name as worker_name, u.avatar_url, wp.worker_type
            FROM public.bids b
            JOIN public.users u ON u.id = b.worker_id
            JOIN public.worker_profiles wp ON wp.user_id = b.worker_id
            WHERE b.job_id = $1
            ORDER BY b.amount_cents ASC
        """, job_id)
    return {"ok": True, "bids": [dict(r) for r in rows]}

# The "Hire" endpoint from previous response goes here...

# ==================================================================
#                       4. JOB COMPLETION & PROOF
# ==================================================================

@app.post("/api/jobs/{job_id}/proof")
async def submit_job_proof(job_id: str, payload: JobProofSubmit, token = Depends(require_user)):
    """
    Worker submits photos saying "I am done".
    """
    worker_id = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        # Verify worker owns this job
        job = await conn.fetchrow("SELECT * FROM public.jobs WHERE id=$1 AND worker_id=$2", job_id, worker_id)
        if not job: raise HTTPException(403, "Not your job")

        await conn.execute("""
            INSERT INTO public.job_proofs (job_id, worker_proof_imgs, worker_comment)
            VALUES ($1, $2, $3)
            ON CONFLICT (job_id) DO UPDATE
            SET worker_proof_imgs = $2, worker_comment = $3, worker_submitted_at = now()
        """, job_id, payload.photos, payload.comment)
        
        await conn.execute("UPDATE public.jobs SET status = 'in_progress' WHERE id=$1", job_id)
        
    return {"ok": True, "msg": "Proof submitted. Waiting for customer approval."}

@app.post("/api/jobs/{job_id}/approve")
async def approve_job_completion(job_id: str, token = Depends(require_user)):
    """
    Customer sees photos -> Clicks "Approve" -> Money Released.
    """
    customer_id = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        # 1. Verify Customer
        job = await conn.fetchrow("SELECT * FROM public.jobs WHERE id=$1 AND customer_id=$2", job_id, customer_id)
        if not job: raise HTTPException(403, "Not your job")

        # 2. Mark Proof as Approved
        await conn.execute("""
            UPDATE public.job_proofs 
            SET customer_approved = true, customer_acted_at = now()
            WHERE job_id = $1
        """, job_id)

        # 3. Mark Job Completed
        await conn.execute("UPDATE public.jobs SET status = 'completed' WHERE id = $1", job_id)

        # 4. RELEASE THE MONEY (Call the DB Function)
        await conn.execute("SELECT release_funds($1)", job_id)

    return {"ok": True, "msg": "Job completed. Funds released to worker."}

# ==================================================================
#                       5. CHATS
# ==================================================================

@app.get("/api/chats")
async def get_my_chats(token = Depends(require_user)):
    """ List all chats for the user (linked to jobs) """
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT c.id as chat_id, j.title as job_title, j.status,
                   CASE WHEN j.customer_id = $1 THEN w.full_name ELSE cust.full_name END as other_party_name
            FROM public.chats c
            JOIN public.jobs j ON j.id = c.job_id
            LEFT JOIN public.users w ON w.id = j.worker_id
            LEFT JOIN public.users cust ON cust.id = j.customer_id
            WHERE j.customer_id = $1 OR j.worker_id = $1
        """, uid)
    return {"ok": True, "chats": [dict(r) for r in rows]}

@app.get("/api/chats/{chat_id}/messages")
async def get_messages(chat_id: str, token = Depends(require_user)):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM public.messages WHERE chat_id = $1 ORDER BY created_at ASC
        """, chat_id)
    return {"ok": True, "messages": [dict(r) for r in rows]}

@app.post("/api/chats/{chat_id}/messages")
async def send_message(chat_id: str, payload: ChatMessage, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1, $2, $3)
        """, chat_id, uid, payload.content)
    return {"ok": True}

# ==================================================================
#                       6. NOTIFICATIONS
# ==================================================================

@app.post("/api/notifications/device")
async def register_device(payload: DeviceToken, token = Depends(require_user)):
    """ Register FCM token for push notifications """
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.push_tokens (user_id, token, device_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (user_id, token) DO UPDATE SET last_used_at = now()
        """, uid, payload.token, payload.device_type)
    return {"ok": True}

@app.get("/api/notifications")
async def get_notifications(token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM public.notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
        """, uid)
    return {"ok": True, "notifications": [dict(r) for r in rows]}

# ==================================================================
#                       AUTH CONFIG (Swagger)
# ==================================================================
def custom_openapi():
    if app.openapi_schema: return app.openapi_schema
    openapi_schema = get_openapi(title=app.title, version=app.version, routes=app.routes)
    openapi_schema.setdefault("components", {}).setdefault("securitySchemes", {})
    openapi_schema["components"]["securitySchemes"]["BearerAuth"] = {
        "type": "http", "scheme": "bearer", "bearerFormat": "JWT"
    }
    app.openapi_schema = openapi_schema
    return app.openapi_schema
app.openapi = custom_openapi