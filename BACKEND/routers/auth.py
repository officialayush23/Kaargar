"""
Auth router — Supabase email+password + Supabase JWT.

Flow:
  SIGNUP:  Frontend calls supabase.auth.signUp()
           → Supabase sends confirmation email
           → User clicks link → Supabase marks email_confirmed
           → Frontend calls POST /auth/provision with Supabase JWT
           → Backend creates user row in our DB

  LOGIN:   Frontend calls supabase.auth.signInWithPassword()
           → Gets Supabase JWT (access_token)
           → Sends JWT to all backend API calls as Bearer token
           → Backend validates JWT in dependencies.py (_decode_token)

  LOGOUT:  Frontend calls supabase.auth.signOut() — stateless on backend

  ME:      GET /auth/me — returns our DB user record from the Supabase JWT

SWAP NOTE:
  When moving to Amazon/custom auth, only dependencies.py changes.
  This router's /provision and /me endpoints stay identical.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt as _jwt
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, WorkerProfile
from schemas import UserResponse, SuccessResponse
from dependencies import get_current_user
from config import get_settings

settings = get_settings()
router = APIRouter()

# ---------------------------------------------------------------------------
# Internal: raw JWT payload (before full user DB lookup)
# Defined first so it can be used as a Depends() in /provision below.
# Used only by /provision which might be called before user row exists.
# ---------------------------------------------------------------------------

_bearer = HTTPBearer()

def _get_raw_payload(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """Decode Supabase JWT without requiring user row in DB (for provision)."""
    secret = settings.supabase_jwt_secret
    if not secret:
        raise HTTPException(500, "SUPABASE_JWT_SECRET not configured")
    try:
        return _jwt.decode(
            credentials.credentials,
            secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        raise HTTPException(401, "Invalid token")


# ---------------------------------------------------------------------------
# POST /auth/provision
# Called once after Supabase signup to create the user record in our DB.
# The Supabase JWT is validated by _get_raw_payload() above.
# ---------------------------------------------------------------------------

class ProvisionBody(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = "user"  # 'user' | 'worker' (admin set manually in DB)


@router.post("/provision", response_model=UserResponse)
async def provision_user(
    body: ProvisionBody,
    current_user_payload: dict = Depends(_get_raw_payload),
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update user row after Supabase signup.
    The Supabase JWT 'sub' is the user's UUID — same as our users.id.
    This endpoint is idempotent (safe to call multiple times).
    """
    user_id: str = current_user_payload.get("sub")
    email: str = current_user_payload.get("email", "")

    now = datetime.now(timezone.utc)

    # Check if user already exists
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user:
        # Update fields if provided
        if body.full_name:
            user.full_name = body.full_name
        if body.phone:
            user.phone = body.phone
        user.last_seen_at = now
        user.email_verified = True
        # Promote user -> worker if this call explicitly requests it
        # (e.g. selected "I am a worker" at signup/signin). Never demote
        # an existing worker/admin back to 'user'. This closes a race where
        # an unrelated provision({}) call (e.g. on app mount, which sends
        # no role) creates/updates the row before the worker-intent call
        # lands, permanently sticking the account at role='user'.
        if body.role == "worker" and user.role == "user":
            user.role = "worker"
    else:
        # Create new user row
        allowed_role = body.role if body.role in ("user", "worker") else "user"
        user = User(
            id=user_id,
            email=email.lower().strip(),
            full_name=body.full_name or "",
            phone=body.phone,
            role=allowed_role,
            email_verified=True,
            last_seen_at=now,
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/me", response_model=UserResponse)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's DB record. Updates last_seen_at."""
    user.last_seen_at = datetime.now(timezone.utc)

    # Sync role if worker profile exists
    if user.role not in ("admin",):
        wp_result = await db.execute(
            select(WorkerProfile.id).where(WorkerProfile.user_id == user.id)
        )
        if wp_result.scalar_one_or_none() and user.role != "worker":
            user.role = "worker"

    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/logout", response_model=SuccessResponse)
async def logout():
    """
    Backend is stateless — actual logout happens on the frontend via
    supabase.auth.signOut(). This endpoint exists for consistency.
    """
    return SuccessResponse(message="Logged out successfully")


