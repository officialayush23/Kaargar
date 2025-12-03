import asyncpg
import redis.asyncio as redis
from uuid import UUID
from fastapi import Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.auth import verify_and_decode_jwt

# 1. Define HTTPBearer. This triggers the "Authorize" button in Swagger UI.
auth_scheme = HTTPBearer()

# --- Database Dependencies ---

async def get_db(request: Request):
    """Yields a database connection from the pool stored in app.state."""
    pool = request.app.state.db_pool
    async with pool.acquire() as conn:
        yield conn

async def get_redis(request: Request) -> redis.Redis:
    """Returns the redis client from app.state."""
    return getattr(request.app.state, "redis", None)

# --- Auth Dependencies ---

async def require_user(
    token: HTTPAuthorizationCredentials = Depends(auth_scheme)
) -> dict:
    """
    Extracts Bearer token, validates JWT using app/auth.py, returns payload.
    """
    return verify_and_decode_jwt(token.credentials)

async def require_db_user(
    token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    """
    Validates user exists in Postgres.
    """
    uid = UUID(token["sub"])
    row = await conn.fetchrow(
        "SELECT id, email, full_name, role FROM public.users WHERE id = $1", uid
    )
    if not row:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User not onboarded")
    
    return {
        "id": row["id"], 
        "email": row["email"], 
        "full_name": row["full_name"], 
        "role": row["role"],
        "jwt": token # Pass token through if needed for downstream logic
    }

async def require_worker(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
) -> dict:
    """
    Validates user is a verified worker.
    """
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