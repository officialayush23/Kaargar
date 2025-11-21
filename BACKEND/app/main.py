# app/main.py
import os
from typing import Optional
from dotenv import load_dotenv
import json
# load .env early so app.auth can read vars
load_dotenv()

import logging
import asyncpg
from fastapi import FastAPI, Depends, Header, Request, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from app.auth import verify_and_decode_jwt, get_user_id_from_jwt, is_admin_token

logger = logging.getLogger("uvicorn.error")

# CORS: your frontend origins (exact protocol+host+port)
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    
]

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL required")

app = FastAPI(title="KAARGAR API (Auth MVP)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # includes Authorization
)

# simple health check
@app.get("/_health")
async def health():
    return {"ok": True}

# create a simple connection pool for asyncpg
@app.on_event("startup")
async def startup():
    logger.info("Starting: creating DB pool")
    app.state.db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=8)
    logger.info("DB pool ready")

@app.on_event("shutdown")
async def shutdown():
    await app.state.db_pool.close()

# Dependency: requires Authorization: Bearer <access_token>
async def require_user(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_and_decode_jwt(token)
    logger.info("require_user: validated token sub=%s", payload.get("sub"))
    return payload

# Admin guard
async def require_admin(authorization: str = Header(None)):
    if is_admin_token(authorization):
        return {"service_role": True}
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_and_decode_jwt(token)
    sub = payload.get("sub")
    async with app.state.db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT role FROM public.users WHERE id = $1", sub)
    if row and row["role"] and "admin" in row["role"]:
        return {"service_role": False, "user_id": sub}
    raise HTTPException(status_code=403, detail="Admin role required")

# endpoints
@app.post("/api/auth/upsert_user")
async def upsert_user_endpoint(request: Request, payload = Depends(require_user)):
    uid = payload.get("sub")
    email = payload.get("email")
    user_meta = payload.get("user_metadata") or {}
    
    # Fallback logic for name
    name = (
        user_meta.get("full_name") 
        or user_meta.get("name") 
        or payload.get("name") 
        or (email.split("@")[0] if email else None)
    )

    async with app.state.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO public.users (id, email, name, created_at, role, metadata)
            VALUES ($1, $2, $3, now(), ARRAY['customer']::text[], $4::jsonb)
            ON CONFLICT (id) DO UPDATE
              SET email = EXCLUDED.email,
                  name = COALESCE(EXCLUDED.name, public.users.name),
                  metadata = public.users.metadata || EXCLUDED.metadata
        """, uid, email, name, json.dumps(payload))  # <--- FIXED: Wrapped in json.dumps()

        row = await conn.fetchrow("SELECT id, email, name, role FROM public.users WHERE id = $1", uid)
    
    return {"ok": True, "user": dict(row)}

@app.get("/api/me")
async def me(payload = Depends(require_user)):
    uid = payload.get("sub")
    async with app.state.db_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT id, email, name, phone_masked, role, is_flagged, kyc_status FROM public.users WHERE id = $1", uid)
    if not row:
        raise HTTPException(status_code=404, detail="User row not found")
    return {"ok": True, "user": dict(row)}

class FlagPayload(BaseModel):
    user_id: str
    reason: Optional[str] = None

@app.post("/api/admin/flag_user")
async def admin_flag_user(payload: FlagPayload, admin = Depends(require_admin)):
    admin_id = admin.get("user_id") if isinstance(admin, dict) else None
    async with app.state.db_pool.acquire() as conn:
        await conn.execute("SELECT public.flag_user($1, $2, $3)", payload.user_id, payload.reason, admin_id)
    return {"ok": True}
