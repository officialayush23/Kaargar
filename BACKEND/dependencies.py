"""
FastAPI dependencies: auth, DB session, role guards.

JWT VALIDATION ADAPTER
======================
Currently validates Supabase JWTs (HS256, signed with SUPABASE_JWT_SECRET).
The Supabase JWT 'sub' claim == user's UUID in our users table.

TO SWAP TO CUSTOM AUTH (when moving to Amazon/custom backend):
  1. Replace the body of `_decode_token()` below with your JWT logic.
  2. Ensure the decoded payload still returns a dict with key 'sub' (user UUID).
  3. Update SWAP_TARGET_NOTE in config if needed.
  Nothing else in the codebase changes — all callers use get_current_user().
"""

import logging
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt

from database import get_db
from models import User, WorkerProfile
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# ── JWT ADAPTER — swap only this function to move off Supabase ─────────────
# ---------------------------------------------------------------------------

def _decode_token(token: str) -> dict:
    """
    Decode and validate a JWT. Returns payload dict with at least {'sub': uuid}.

    CURRENT:  Supabase HS256 JWT, validated with SUPABASE_JWT_SECRET.
    FUTURE:   Replace body with custom JWT logic (e.g. python-jose with your
              own secret, or AWS Cognito JWK verification).
    """
    secret = settings.supabase_jwt_secret
    if not secret:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET not configured")

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},  # Supabase sets aud='authenticated'
        )
        return payload
    except JWTError as e:
        logger.debug(f"JWT validation failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ---------------------------------------------------------------------------
# ── Core dependency ────────────────────────────────────────────────────────
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = _decode_token(credentials.credentials)

    user_id: str = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing 'sub' claim")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User profile not found — please complete registration."
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Account banned")

    return user


async def require_worker(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if user.role == "admin":
        return user
    result = await db.execute(
        select(WorkerProfile.id).where(WorkerProfile.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Worker access required")
    if user.role != "worker":
        user.role = "worker"
        await db.commit()
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(HTTPBearer(auto_error=False)),
):
    return credentials
