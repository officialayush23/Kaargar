"""
Auth router — email OTP send/verify → custom JWT.
"""

import hashlib
import secrets
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from jose import jwt

from database import get_db
from models import User, OTPSession, WorkerProfile
from schemas import OTPSendRequest, OTPVerifyRequest, TokenResponse, UserResponse
from config import get_settings
from services.notifications import send_otp_email

settings = get_settings()
router = APIRouter()

OTP_EXPIRE_MINUTES = 10


def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def _generate_otp(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def _create_jwt(user_id: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "role": role, "exp": expire},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


@router.post("/send-otp")
async def send_otp(
    body: OTPSendRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    identifier = body.email.strip().lower()

    # Rate-limit check via Redis if available
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url)
        key = f"otp_limit:{identifier}"
        count = await r.get(key)
        if count and int(count) >= 5:
            raise HTTPException(429, "Too many OTP requests. Try again in an hour.")
        await r.incr(key)
        await r.expire(key, 3600)
        await r.aclose()
    except Exception:
        pass  # Redis optional for dev

    otp = _generate_otp()
    otp_hash = _hash_otp(otp)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)

    # Mark previous sessions as used
    await db.execute(
        OTPSession.__table__.update()
        .where(OTPSession.identifier == identifier)
        .where(OTPSession.is_used == False)
        .values(is_used=True)
    )

    session = OTPSession(
        identifier=identifier,
        type="email",
        otp_hash=otp_hash,
        purpose="login",
        expires_at=expires_at,
    )
    db.add(session)
    await db.commit()

    background.add_task(send_otp_email, identifier, otp)
    return {"message": "OTP sent", "expires_in": OTP_EXPIRE_MINUTES * 60}


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    identifier = body.email.strip().lower()
    submitted_token = body.token.strip()
    normalized_token = "".join(ch for ch in submitted_token if ch.isdigit())
    token_candidates = [submitted_token]
    if normalized_token and normalized_token not in token_candidates:
        token_candidates.insert(0, normalized_token)
    if not token_candidates[0]:
        raise HTTPException(400, "OTP is required")

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(OTPSession)
        .where(OTPSession.identifier == identifier)
        .where(OTPSession.is_used == False)
        .where(OTPSession.expires_at > now)
        .order_by(OTPSession.created_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(400, "OTP expired or not found")

    if session.attempts >= session.max_attempts:
        raise HTTPException(400, "Too many incorrect attempts")

    if not any(session.otp_hash == _hash_otp(candidate) for candidate in token_candidates):
        session.attempts += 1
        await db.commit()
        remaining = session.max_attempts - session.attempts
        raise HTTPException(400, f"Incorrect OTP. {remaining} attempt(s) left")

    # Mark used
    session.is_used = True
    await db.commit()

    # Upsert user
    user_result = await db.execute(
        select(User).where(func.lower(User.email) == identifier)
    )
    user = user_result.scalar_one_or_none()

    if not user:
        user = User(email=identifier, email_verified=True, last_seen_at=now)
        db.add(user)
    else:
        user.email_verified = True
        user.last_seen_at = now

    await db.flush()

    wp_result = await db.execute(
        select(WorkerProfile.id).where(WorkerProfile.user_id == user.id)
    )
    if wp_result.scalar_one_or_none() and user.role != "admin":
        user.role = "worker"

    await db.commit()
    await db.refresh(user)

    token = _create_jwt(str(user.id), user.role)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


# APPEND THIS TO THE BOTTOM OF YOUR EXISTING routers/auth.py
from schemas import RefreshRequest, SuccessResponse
from jose import JWTError

@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    if not body.refresh_token:
        raise HTTPException(401, "Refresh token missing")
    try:
        payload = jwt.decode(body.refresh_token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid token type")
        
        user_id = payload.get("sub")
        user_result = await db.execute(select(User).where(User.id == user_id))
        user = user_result.scalar_one_or_none()
        
        if not user or not user.is_active:
            raise HTTPException(401, "User inactive")

        # Create new access token, keep old refresh
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_access_token_expire_minutes)
        new_access = jwt.encode(
            {"sub": str(user.id), "type": "access", "exp": expire},
            settings.jwt_secret_key,
            algorithm=settings.jwt_algorithm,
        )

        return {
            "access_token": new_access,
            "refresh_token": body.refresh_token,
            "token_type": "bearer",
            "user": UserResponse.model_validate(user)
        }
    except JWTError:
        raise HTTPException(401, "Invalid or expired refresh token")

@router.post("/logout", response_model=SuccessResponse)
async def logout():
    # Stateless JWT flow: just confirm to frontend so it can drop tokens
    return SuccessResponse(message="Logged out successfully")
