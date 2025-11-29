# app/main.py
import os
import json
import logging
import asyncpg
from typing import Optional, List, Any, Dict
from datetime import date
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

app = FastAPI(title="KAARGAR API 3.1 (Chat)", version="3.1.0")

# CORS
origins = ["http://localhost:5173", "http://localhost:3000"]
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=True, 
    allow_methods=["*"], allow_headers=["*"]
)

# --- DB LIFECYCLE ---
@app.on_event("startup")
async def startup():
    logger.info("Connecting to Database...")
    app.state.db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)

@app.on_event("shutdown")
async def shutdown():
    logger.info("Closing Database...")
    await app.state.db_pool.close()

# --- SECURITY ---
security = HTTPBearer()
async def require_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    return verify_and_decode_jwt(creds.credentials)

# ==================================================================
#                       PYDANTIC MODELS
# ==================================================================

def calculate_age(dob: date):
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

class ProfileCreate(BaseModel):
    role: str 
    gender: Optional[str] = None 
    dob: Optional[date] = None 
    worker_type: Optional[str] = "individual" 
    professions: Optional[List[str]] = []
    services: Optional[List[str]] = [] 
    min_hourly_rate_cents: Optional[int] = 0
    experience_years: Optional[int] = 0
    about_text: Optional[str] = None
    accepts_auto_assign: bool = False

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None 
    avatar_url: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[date] = None
    address_text: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

class WorkerUpdate(BaseModel):
    professions: Optional[List[str]] = None
    services: Optional[List[str]] = None
    min_hourly_rate_cents: Optional[int] = None
    experience_years: Optional[int] = None
    about_text: Optional[str] = None
    accepts_auto_assign: Optional[bool] = None
    is_online: Optional[bool] = None
    search_radius_meters: Optional[int] = None

class JobCreate(BaseModel):
    title: str
    description: Optional[str] = None
    profession_required: str 
    services_required: List[str] = [] 
    category: Optional[str] = None
    lat: float
    lon: float
    address_text: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None
    budget_max_cents: Optional[int] = None
    is_remote: bool = False

class DirectBooking(BaseModel):
    worker_id: str
    job_details: JobCreate

class HireRequest(BaseModel):
    job_id: str
    bid_id: str

class LocationUpdate(BaseModel):
    lat: float
    lon: float

class BidCreate(BaseModel):
    amount_cents: int
    message: Optional[str] = None

class BillItem(BaseModel):
    item: str
    price: float

class JobProofSubmit(BaseModel):
    photos: List[str]
    comment: str
    bill_details: List[BillItem] = []

class RatingCreate(BaseModel):
    target_id: str
    job_id: str
    rating: int 
    comment: str

class ChatMessage(BaseModel):
    content: str
    
class KycUpload(BaseModel):
    doc_type: str
    storage_path: str
    
class ComplaintCreate(BaseModel):
    target_user_id: Optional[str] = None
    job_id: Optional[str] = None
    complaint_type: str 
    subject: str
    description: str

class DeviceToken(BaseModel):
    token: str
    device_type: str = "android"

# ==================================================================
#                       1. PROFILE & ONBOARDING
# ==================================================================

@app.post("/api/auth/upsert_user")
async def upsert_user(payload = Depends(require_user)):
    uid = payload.get("sub")
    email = payload.get("email")
    meta = payload.get("user_metadata") or {}
    name = meta.get("full_name") or meta.get("name")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.users (id, email, full_name, role)
            VALUES ($1, $2, $3, 'customer')
            ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
        """, uid, email, name)
        await conn.execute("INSERT INTO public.governance_stats (user_id) VALUES ($1) ON CONFLICT DO NOTHING", uid)
    return {"ok": True}

@app.post("/api/profiles/onboard")
async def create_profile(payload: ProfileCreate, token = Depends(require_user)):
    uid = token.get("sub")
    if payload.dob:
        age = calculate_age(payload.dob)
        if payload.role in ['worker', 'agency'] and age < 18:
            raise HTTPException(status_code=400, detail="Workers must be at least 18 years old.")
    elif payload.role == 'worker':
        raise HTTPException(status_code=400, detail="Date of Birth is required for workers.")

    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            UPDATE public.users SET role = $1::user_role, gender = $2, dob = $3 WHERE id = $4
        """, payload.role, payload.gender, payload.dob, uid)
        
        if payload.role in ['worker', 'agency', 'company']:
            await conn.execute("""
                INSERT INTO public.worker_profiles 
                (user_id, worker_type, professions, services, min_hourly_rate_cents, experience_years, about_text, accepts_auto_assign, is_online)
                VALUES ($1, $2::worker_type, $3, $4, $5, $6, $7, $8, true)
                ON CONFLICT (user_id) DO UPDATE 
                SET professions=$3, services=$4, min_hourly_rate_cents=$5, experience_years=$6, about_text=$7, accepts_auto_assign=$8
            """, uid, payload.worker_type, payload.professions, payload.services, payload.min_hourly_rate_cents, 
                 payload.experience_years, payload.about_text, payload.accepts_auto_assign)
            await conn.execute("INSERT INTO public.wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", uid)
    return {"ok": True, "message": "Profile updated successfully"}

@app.get("/api/me")
async def get_my_profile(token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT * FROM public.users WHERE id = $1", uid)
        if not user: raise HTTPException(404, "User not found")
        worker = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", uid)
        wallet = await conn.fetchrow("SELECT * FROM public.wallets WHERE user_id = $1", uid)
        stats = await conn.fetchrow("SELECT * FROM public.governance_stats WHERE user_id = $1", uid)
    res = dict(user)
    if worker: res["worker_profile"] = dict(worker)
    if wallet: res["wallet"] = dict(wallet)
    if stats: res["stats"] = dict(stats)
    return {"ok": True, "user": res}

@app.patch("/api/me/profile")
async def update_user_profile(payload: UserUpdate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            UPDATE public.users SET 
                full_name = COALESCE($1, full_name), phone = COALESCE($2, phone),
                avatar_url = COALESCE($3, avatar_url), gender = COALESCE($4, gender),
                dob = COALESCE($5, dob), address_text = COALESCE($6, address_text),
                city = COALESCE($7, city), state = COALESCE($8, state), pincode = COALESCE($9, pincode)
            WHERE id = $10
        """, payload.full_name, payload.phone, payload.avatar_url, payload.gender, payload.dob,
             payload.address_text, payload.city, payload.state, payload.pincode, uid)
    return {"ok": True}

@app.patch("/api/me/worker")
async def update_worker_profile(payload: WorkerUpdate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT role FROM public.users WHERE id=$1", uid)
        if user['role'] == 'customer': raise HTTPException(403, "Not a worker")
        await conn.execute("""
            UPDATE public.worker_profiles SET
                professions = COALESCE($1, professions), services = COALESCE($2, services),
                min_hourly_rate_cents = COALESCE($3, min_hourly_rate_cents), experience_years = COALESCE($4, experience_years),
                about_text = COALESCE($5, about_text), accepts_auto_assign = COALESCE($6, accepts_auto_assign),
                is_online = COALESCE($7, is_online), search_radius_meters = COALESCE($8, search_radius_meters)
            WHERE user_id = $9
        """, payload.professions, payload.services, payload.min_hourly_rate_cents, payload.experience_years, 
             payload.about_text, payload.accepts_auto_assign, payload.is_online, 
             payload.search_radius_meters, uid)
    return {"ok": True}

@app.patch("/api/me/location")
async def update_location(loc: LocationUpdate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.user_locations (user_id, location, last_updated_at)
            VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, now())
            ON CONFLICT (user_id) DO UPDATE SET location = EXCLUDED.location, last_updated_at = now()
        """, uid, loc.lon, loc.lat)
    return {"ok": True}

# ==================================================================
#                       2. SEARCH & FEED
# ==================================================================

@app.get("/api/search")
async def search_workers_endpoint(
    lat: float, lon: float, 
    profession: Optional[str] = None, 
    service: Optional[str] = None, 
    gender: Optional[str] = None,
    sort_by: str = "recommended", 
    radius: int = 15000
):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM search_workers($1, $2, $3, $4, $5, $6, $7)
        """, lat, lon, profession, service, radius, gender, sort_by)
    return {"ok": True, "results": [dict(r) for r in rows]}

@app.get("/api/jobs/search")
async def search_jobs_endpoint(
    lat: float, lon: float, 
    query: Optional[str] = None, 
    min_budget: Optional[int] = None,
    radius: int = 20000
):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT * FROM search_jobs($1, $2, $3, $4, $5, NULL, NULL)
        """, lat, lon, query, radius, min_budget)
    return {"ok": True, "results": [dict(r) for r in rows]}

@app.get("/api/jobs/feed")
async def get_worker_job_feed(
    token = Depends(require_user), lat: float = 0.0, lon: float = 0.0, 
    radius: int = 20000, filter_by_profession: bool = False
):
    worker_id = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        worker = await conn.fetchrow("SELECT professions, services FROM public.worker_profiles WHERE user_id=$1", worker_id)
        if not worker: return {"ok": True, "jobs": []}
        my_professions = worker['professions'][0] if worker['professions'] else None
        my_services = worker['services'] if worker['services'] else None
        profession_arg = my_professions if filter_by_profession else None
        services_arg = my_services if filter_by_profession else None
        rows = await conn.fetch("""
            SELECT * FROM search_jobs($1, $2, NULL, $3, NULL, $4, $5)
        """, lat, lon, radius, profession_arg, services_arg)
    return {"ok": True, "jobs": [dict(r) for r in rows]}

# ==================================================================
#                       3. JOB FLOW & CHAT
# ==================================================================

@app.post("/api/jobs/{job_id}/chat")
async def get_or_create_chat(job_id: str, token = Depends(require_user)):
    """ 
    Ensures a chat room exists for this job and returns the chat_id.
    """
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        # 1. Check existing
        chat = await conn.fetchrow("SELECT id FROM public.chats WHERE job_id = $1", job_id)
        if chat:
            return {"ok": True, "chat_id": str(chat['id'])}
            
        # 2. Verify Authorization (Must be Customer or Worker)
        job = await conn.fetchrow("SELECT customer_id, worker_id FROM public.jobs WHERE id = $1", job_id)
        if not job: raise HTTPException(404, "Job not found")
        
        if str(job['customer_id']) != uid and str(job['worker_id']) != uid:
            raise HTTPException(403, "Access denied")
            
        # 3. Create Chat
        chat_id = await conn.fetchval("INSERT INTO public.chats (job_id) VALUES ($1) RETURNING id", job_id)
        return {"ok": True, "chat_id": str(chat_id)}

@app.post("/api/jobs/book")
async def direct_book_worker(payload: DirectBooking, token = Depends(require_user)):
    customer_id = token.get("sub")
    job = payload.job_details
    final_category = job.category if job.category else job.profession_required
    async with app.state.db_pool.acquire() as conn:
        worker = await conn.fetchrow("SELECT accepts_auto_assign, is_online FROM public.worker_profiles WHERE user_id=$1", payload.worker_id)
        if not worker: raise HTTPException(404, "Worker not found")
        if not worker['is_online']: raise HTTPException(400, "Worker is offline")
        initial_status = 'assigned' if worker['accepts_auto_assign'] else 'pending_acceptance'
        row = await conn.fetchrow("""
            INSERT INTO public.jobs (
                customer_id, worker_id, title, description, 
                profession_required, services_required, category,
                job_location, address_text, city, pincode,
                budget_max_cents, price_type, is_remote, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10, $11, $12, $13, 'fixed', $14, $15)
            RETURNING id
        """, customer_id, payload.worker_id, job.title, job.description, 
             job.profession_required, job.services_required, final_category,
             job.lon, job.lat, job.address_text, job.city, job.pincode,
             job.budget_max_cents, job.is_remote, initial_status)
    return {"ok": True, "job_id": str(row["id"]), "status": initial_status}

@app.post("/api/jobs")
async def post_open_job(payload: JobCreate, token = Depends(require_user)):
    uid = token.get("sub")
    final_category = payload.category if payload.category else payload.profession_required
    async with app.state.db_pool.acquire() as conn:
        row = await conn.fetchrow("""
            INSERT INTO public.jobs (
                customer_id, title, description, 
                profession_required, services_required, category,
                job_location, address_text, city, pincode,
                budget_max_cents, price_type, is_remote, status
            )
            VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, $10, $11, $12, 'hourly', $13, 'open')
            RETURNING id
        """, uid, payload.title, payload.description, 
             payload.profession_required, payload.services_required, final_category,
             payload.lon, payload.lat, payload.address_text, payload.city, payload.pincode,
             payload.budget_max_cents, payload.is_remote)
    return {"ok": True, "job_id": str(row["id"])}

@app.post("/api/jobs/{job_id}/bids")
async def place_bid(job_id: str, payload: BidCreate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        user = await conn.fetchrow("SELECT role FROM public.users WHERE id = $1", uid)
        if user['role'] == 'customer': raise HTTPException(403, "Only workers can bid")
        await conn.execute("INSERT INTO public.bids (job_id, worker_id, amount_cents, message) VALUES ($1, $2, $3, $4)", job_id, uid, payload.amount_cents, payload.message)
        await conn.execute("UPDATE public.jobs SET status = 'bidding' WHERE id = $1 AND status = 'open'", job_id)
    return {"ok": True}

@app.post("/api/jobs/hire")
async def hire_worker_endpoint(payload: HireRequest, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        try:
            await conn.execute("SELECT hire_worker($1, $2, $3)", payload.job_id, payload.bid_id, uid)
        except Exception as e:
            raise HTTPException(400, f"Hire failed: {e}")
    return {"ok": True}

@app.delete("/api/jobs/{job_id}")
async def delete_job(job_id: str, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("SELECT status, customer_id FROM public.jobs WHERE id = $1", job_id)
        if not job: raise HTTPException(404, "Job not found")
        if str(job['customer_id']) != uid: raise HTTPException(403, "You can only delete your own jobs")
        if job['status'] not in ['open', 'pending_acceptance', 'bidding']:
            raise HTTPException(400, "Cannot delete active/assigned job. Please cancel instead.")
        await conn.execute("DELETE FROM public.jobs WHERE id = $1", job_id)
    return {"ok": True, "message": "Job deleted"}

# --- Job Status Update ---
class JobStatusUpdate(BaseModel):
    status: str

@app.patch("/api/jobs/{job_id}/status")
async def update_job_status(job_id: str, payload: JobStatusUpdate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("SELECT worker_id FROM public.jobs WHERE id = $1", job_id)
        if not job: raise HTTPException(404, "Job not found")
        if str(job['worker_id']) != uid: raise HTTPException(403, "Not authorized")
        if payload.status not in ['assigned', 'cancelled']: raise HTTPException(400, "Invalid status transition")
        await conn.execute("UPDATE public.jobs SET status = $1 WHERE id = $2", payload.status, job_id)
    return {"ok": True}

# ==================================================================
#                       4. HISTORY & STATS
# ==================================================================

@app.get("/api/me/jobs/posted")
async def get_my_posted_jobs(token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT j.id, j.title, j.status, j.created_at, w.full_name as worker_name, 
                   j.budget_max_cents as amount_cents,
                   (SELECT COUNT(*) FROM public.bids WHERE job_id = j.id) as bid_count
            FROM public.jobs j
            LEFT JOIN public.users w ON w.id = j.worker_id
            WHERE j.customer_id = $1
            ORDER BY j.created_at DESC
        """, uid)
    return {"ok": True, "jobs": [dict(r) for r in rows]}

@app.get("/api/me/jobs/worked")
async def get_my_worked_jobs(token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT j.id, j.title, j.status, j.created_at, c.full_name as customer_name,
                   COALESCE(p.amount_cents, j.budget_max_cents) as amount_cents,
                   j.customer_id
            FROM public.jobs j
            JOIN public.users c ON c.id = j.customer_id
            LEFT JOIN public.payments p ON p.job_id = j.id AND p.payee_id = j.worker_id
            WHERE j.worker_id = $1
            ORDER BY j.created_at DESC
        """, uid)
    return {"ok": True, "jobs": [dict(r) for r in rows]}

@app.get("/api/me/stats")
async def get_financial_stats(token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        spent = await conn.fetchval("SELECT COALESCE(SUM(amount_cents), 0) FROM public.payments WHERE payer_id = $1 AND status = 'released'", uid)
        earned = await conn.fetchval("SELECT COALESCE(SUM(amount_cents), 0) FROM public.payments WHERE payee_id = $1 AND status = 'released'", uid)
        jobs_done = await conn.fetchval("SELECT COUNT(*) FROM public.jobs WHERE worker_id = $1 AND status = 'completed'", uid)
    return { "ok": True, "total_spent_cents": spent, "total_earned_cents": earned, "jobs_completed_count": jobs_done }

@app.get("/api/jobs/{job_id}")
async def get_single_job(job_id: str, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("""
            SELECT j.*, 
                   w.full_name as worker_name, w.avatar_url as worker_avatar, w.phone as worker_phone,
                   c.full_name as customer_name, c.avatar_url as customer_avatar, c.phone as customer_phone,
                   jp.worker_proof_imgs, jp.worker_comment, jp.bill_details, jp.worker_submitted_at
            FROM public.jobs j
            LEFT JOIN public.users w ON w.id = j.worker_id
            LEFT JOIN public.users c ON c.id = j.customer_id
            LEFT JOIN public.job_proofs jp ON jp.job_id = j.id
            WHERE j.id = $1
        """, job_id)
        if not job: raise HTTPException(404, "Job not found")
        if str(job['customer_id']) != uid and str(job['worker_id']) != uid:
            raise HTTPException(403, "Access Denied")
        job_dict = dict(job)
        if job['status'] not in ['assigned', 'in_progress', 'completed']:
             if str(job['customer_id']) != uid: job_dict['customer_phone'] = None
             if str(job['worker_id']) != uid: job_dict['worker_phone'] = None
    return {"ok": True, "job": job_dict}

# ==================================================================
#                       5. MISC (RATINGS, PROOF, KYC, CHAT)
# ==================================================================

@app.post("/api/ratings/worker")
async def rate_worker(payload: RatingCreate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("SELECT id FROM public.jobs WHERE id=$1 AND customer_id=$2 AND worker_id=$3", payload.job_id, uid, payload.target_id)
        if not job: raise HTTPException(400, "Invalid Job/Worker relationship")
        await conn.execute("INSERT INTO public.worker_ratings (job_id, reviewer_id, target_id, rating, comment) VALUES ($1, $2, $3, $4, $5)", payload.job_id, uid, payload.target_id, payload.rating, payload.comment)
    return {"ok": True}

@app.post("/api/ratings/user")
async def rate_user(payload: RatingCreate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("SELECT id FROM public.jobs WHERE id=$1 AND worker_id=$2 AND customer_id=$3", payload.job_id, uid, payload.target_id)
        if not job: raise HTTPException(400, "Invalid Job/Customer relationship")
        await conn.execute("INSERT INTO public.user_ratings (job_id, reviewer_id, target_id, rating, comment) VALUES ($1, $2, $3, $4, $5)", payload.job_id, uid, payload.target_id, payload.rating, payload.comment)
    return {"ok": True}

@app.get("/api/ratings/{user_id}")
async def get_reviews(user_id: str):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT rating, comment, created_at, 'worker_rating' as type FROM public.worker_ratings WHERE target_id = $1 UNION ALL SELECT rating, comment, created_at, 'user_rating' as type FROM public.user_ratings WHERE target_id = $1 ORDER BY created_at DESC LIMIT 20", user_id)
    return {"ok": True, "reviews": [dict(r) for r in rows]}

@app.post("/api/jobs/{job_id}/proof")
async def submit_job_proof(job_id: str, payload: JobProofSubmit, token = Depends(require_user)):
    worker_id = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("SELECT * FROM public.jobs WHERE id=$1 AND worker_id=$2", job_id, worker_id)
        if not job: raise HTTPException(403, "Not your job")
        
        bill_json = json.dumps([item.dict() for item in payload.bill_details])
        await conn.execute("""
            INSERT INTO public.job_proofs (job_id, worker_proof_imgs, worker_comment, bill_details) 
            VALUES ($1, $2, $3, $4::jsonb)
            ON CONFLICT (job_id) DO UPDATE 
            SET worker_proof_imgs = $2, worker_comment = $3, bill_details = $4::jsonb, worker_submitted_at = now()
        """, job_id, payload.photos, payload.comment, bill_json)
        
        await conn.execute("UPDATE public.jobs SET status = 'in_progress' WHERE id=$1", job_id)
    return {"ok": True, "msg": "Proof submitted."}

@app.post("/api/jobs/{job_id}/approve")
async def approve_job_completion(job_id: str, token = Depends(require_user)):
    customer_id = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        job = await conn.fetchrow("SELECT * FROM public.jobs WHERE id=$1 AND customer_id=$2", job_id, customer_id)
        if not job: raise HTTPException(403, "Not your job")
        await conn.execute("UPDATE public.job_proofs SET customer_approved = true, customer_acted_at = now() WHERE job_id = $1", job_id)
        await conn.execute("UPDATE public.jobs SET status = 'completed' WHERE id = $1", job_id)
        await conn.execute("SELECT release_funds($1)", job_id)
    return {"ok": True}

@app.post("/api/kyc")
async def upload_kyc_record(payload: KycUpload, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("INSERT INTO public.kyc_documents (user_id, doc_type, storage_path, status) VALUES ($1, $2, $3, 'pending')", uid, payload.doc_type, payload.storage_path)
    return {"ok": True}

@app.post("/api/complaints")
async def file_complaint(payload: ComplaintCreate, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("INSERT INTO public.complaints (reporter_id, target_user_id, job_id, complaint_type, subject, description) VALUES ($1, $2, $3, $4, $5, $6)", uid, payload.target_user_id, payload.job_id, payload.complaint_type, payload.subject, payload.description)
    return {"ok": True}

@app.get("/api/chats")
async def get_my_chats(token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT c.id as chat_id, j.title as job_title, j.status, CASE WHEN j.customer_id = $1 THEN w.full_name ELSE cust.full_name END as other_party_name FROM public.chats c JOIN public.jobs j ON j.id = c.job_id LEFT JOIN public.users w ON w.id = j.worker_id LEFT JOIN public.users cust ON cust.id = j.customer_id WHERE j.customer_id = $1 OR j.worker_id = $1", uid)
    return {"ok": True, "chats": [dict(r) for r in rows]}

@app.get("/api/chats/{chat_id}/messages")
async def get_messages(chat_id: str, token = Depends(require_user)):
    async with app.state.db_pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM public.messages WHERE chat_id = $1 ORDER BY created_at ASC", chat_id)
    return {"ok": True, "messages": [dict(r) for r in rows]}

@app.post("/api/chats/{chat_id}/messages")
async def send_message(chat_id: str, payload: ChatMessage, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1, $2, $3)", chat_id, uid, payload.content)
    return {"ok": True}

@app.post("/api/notifications/device")
async def register_device(payload: DeviceToken, token = Depends(require_user)):
    uid = token.get("sub")
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("INSERT INTO public.push_tokens (user_id, token, device_type) VALUES ($1, $2, $3) ON CONFLICT (user_id, token) DO UPDATE SET last_used_at = now()", uid, payload.token, payload.device_type)
    return {"ok": True}

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