from fastapi import APIRouter, Depends, HTTPException
import asyncpg
import redis.asyncio as redis
from typing import Optional, List, Any
from uuid import UUID
from app.dependencies import get_db, get_redis, require_user, require_db_user
from app.models import ProfileUpdate, WorkerProfileUpdate, LocationUpdate

router = APIRouter(tags=["Auth & Profile"])

@router.post("/api/auth/upsert_user")
async def upsert_user(
    user_token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = UUID(user_token["sub"])
    email = user_token.get("email")
    
    # Upsert User (Ensure email is current)
    await conn.execute(
        """
        INSERT INTO public.users (id, email, role) 
        VALUES ($1, $2, 'customer') 
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email
        """,
        uid, email
    )
    # Upsert Wallet
    await conn.execute(
        "INSERT INTO public.wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", 
        uid
    )
    return {"ok": True, "data": {"id": str(uid), "email": email}}

@router.get("/api/me")
async def get_me(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    """
    Returns FULL profile including address, phone, gender etc.
    """
    uid = user["id"]
    
    # 1. Fetch FULL user row (Fixes missing profile data)
    full_user = await conn.fetchrow("SELECT * FROM public.users WHERE id = $1", uid)
    
    worker = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", uid)
    gov = await conn.fetchrow("SELECT * FROM public.governance_stats WHERE user_id = $1", uid)
    wallet = await conn.fetchrow("SELECT * FROM public.wallets WHERE user_id = $1", uid)
    
    # Fetch KYC docs
    kyc_docs = await conn.fetch(
        "SELECT id, doc_type, doc_subtype, storage_path, status, uploaded_at FROM public.kyc_documents WHERE user_id = $1 ORDER BY uploaded_at DESC", 
        uid
    )

    # Convert Record objects to dicts, handling dates if necessary
    user_data = dict(full_user) if full_user else user
    
    return {
        "ok": True,
        "data": {
            "user": user_data, 
            "worker_profile": dict(worker) if worker else None,
            "governance": dict(gov) if gov else None,
            "wallet": dict(wallet) if wallet else None,
            "kyc_documents": [dict(r) for r in kyc_docs],
        },
    }

@router.patch("/api/me/profile")
async def update_profile(
    payload: ProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Updates basic user details (Name, Phone, Address, DOB, Gender).
    """
    uid = user["id"]
    fields = payload.dict(exclude_unset=True)
    if not fields: return {"ok": True}
    
    cols, vals = [], []
    for i, (k, v) in enumerate(fields.items(), start=1):
        cols.append(f"{k} = ${i}")
        vals.append(v)
    vals.append(uid)
    
    query = f"UPDATE public.users SET {', '.join(cols)} WHERE id = ${len(vals)} RETURNING *"
    row = await conn.fetchrow(query, *vals)
    return {"ok": True, "data": dict(row)}

@router.patch("/api/me/worker")
async def upsert_worker_profile(
    payload: WorkerProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    """
    Registers/Updates worker profile (Online status, Direct Hire, Rates).
    """
    uid = user["id"]
    
    # 1. Ensure role is worker
    if user["role"] != "worker":
        await conn.execute("UPDATE public.users SET role = 'worker' WHERE id = $1", uid)

    fields = payload.dict(exclude_unset=True)
    
    # 2. Check existence
    exists = await conn.fetchval("SELECT 1 FROM public.worker_profiles WHERE user_id = $1", uid)
    
    if not exists:
        # Create
        if not fields:
            await conn.execute("INSERT INTO public.worker_profiles (user_id) VALUES ($1)", uid)
            return {"ok": True}
        
        cols = ["user_id"] + list(fields.keys())
        vals = [uid] + list(fields.values())
        placeholders = [f"${i+1}" for i in range(len(vals))]
        
        query = f"INSERT INTO public.worker_profiles ({', '.join(cols)}) VALUES ({', '.join(placeholders)}) RETURNING *"
        row = await conn.fetchrow(query, *vals)
        return {"ok": True, "data": dict(row)}
            
    # 3. Update
    if fields:
        cols, vals = [], []
        for i, (k, v) in enumerate(fields.items(), start=1):
            cols.append(f"{k} = ${i}")
            vals.append(v)
        vals.append(uid)
        
        query = f"UPDATE public.worker_profiles SET {', '.join(cols)}, updated_at = now() WHERE user_id = ${len(vals)} RETURNING *"
        row = await conn.fetchrow(query, *vals)
        return {"ok": True, "data": dict(row)}

    return {"ok": True}

@router.patch("/api/me/location")
async def update_location(
    payload: LocationUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
    r: Optional[redis.Redis] = Depends(get_redis)
):
    uid = user["id"]
    
    # PostGIS
    await conn.execute(
        """
        INSERT INTO public.user_locations (user_id, location)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3)::geography, 4326))
        ON CONFLICT (user_id) DO UPDATE SET location = EXCLUDED.location, last_updated_at = now()
        """,
        uid, payload.lon, payload.lat
    )

    # Redis Geo
    if r:
        try:
            await r.geoadd("worker_locations", [payload.lon, payload.lat, str(uid)])
        except Exception as e:
            print(f"Redis Geo error: {e}")

    return {"ok": True}