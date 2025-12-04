import asyncpg
import redis.asyncio as redis
from uuid import UUID
from fastapi import Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth import verify_and_decode_jwt

auth_scheme = HTTPBearer()

# --- Database Dependencies ---

async def get_db(request: Request):
    pool = request.app.state.db_pool
    async with pool.acquire() as conn:
        yield conn

async def get_redis(request: Request) -> redis.Redis:
    return getattr(request.app.state, "redis", None)

# --- Auth Dependencies ---

async def require_user(
    token: HTTPAuthorizationCredentials = Depends(auth_scheme)
) -> dict:
    return verify_and_decode_jwt(token.credentials)

async def require_db_user(
    token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    uid = UUID(token["sub"])
    # Added avatar_url here
    row = await conn.fetchrow(
        "SELECT id, email, full_name, role, avatar_url FROM public.users WHERE id = $1", uid
    )
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User not onboarded")
    
    return {
        "id": row["id"], 
        "email": row["email"], 
        "full_name": row["full_name"], 
        "role": row["role"],
        "avatar_url": row["avatar_url"], # Included in return dict
        "jwt": token
    }

async def require_worker(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    if user["role"] != "worker":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Worker account required")
    
    wp = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", user["id"])
    if not wp:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Worker profile not set up")
    
    if wp["kyc_status"] != "verified":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "KYC not verified")
        
    return {**user, "worker_profile": wp}

async def require_admin(user: dict = Depends(require_db_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user