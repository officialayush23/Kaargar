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
            # Supabase user sessions carry aud='authenticated'. Verifying it
            # rejects other tokens signed with the same project secret (e.g.
            # the anon / service-role API keys) being replayed as a user.
            audience="authenticated",
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


async def require_approved_worker(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Like require_worker, but the profile must be APPROVED.

    THE DISTINCTION, and why both exist:

      require_worker          — "you have a worker profile". Use for READ and
                                self-service screens a PENDING worker must
                                still reach: their own profile, documents,
                                verification status, reapply. Locking those
                                behind approval would trap someone in a state
                                where they can't do the very thing that gets
                                them approved.

      require_approved_worker — "an admin has verified you". Use for anything
                                that SELLS: packages, offers, bookable slot
                                inventory, going online, taking jobs.

    Before this existed, `require_worker` checked only that a WorkerProfile row
    EXISTED, and silently promoted `user.role` to 'worker' as a side effect —
    so merely starting onboarding made an unverified account look and behave
    like a working one. The money paths (dispatch, search, going online, job
    acceptance) each carried their own `verification_status == 'approved'`
    check, so nobody unapproved could actually be booked or paid; but
    everything else — publishing services, creating packages and offers,
    setting slots — was open. That's the gap this closes.

    CORRECTION 2026-08-25 — this was applied TOO BROADLY and broke onboarding.
    -------------------------------------------------------------------------
    Services, coverage areas and weekly availability were put behind
    `require_approved_worker`. But those are declared DURING onboarding, by
    definition before approval, so all three calls 403'd the moment a worker
    published — the exact trap the paragraph above warns about, just applied to
    documents and not to these. The mobile client wrapped each call in an empty
    `catch {}`, so it reported success and silently saved nothing.

    They are now `require_worker`. That is safe, and it was verified rather
    than assumed: a pending worker's rows are unreachable because EVERY
    marketplace path filters on approval independently —
    `routers/search.py` (5 filters), `services/matching.py` (16),
    `routers/jobs.py` booking creation, and the go-online toggle in this
    router. A service row that exists but cannot be searched, dispatched,
    booked or brought online is a declaration, not an offer.

    Rule of thumb when adding a route: gate on `require_approved_worker` only
    if the action puts something in front of a customer or moves money. If it
    only describes the worker, `require_worker` — otherwise you strand people
    in a state where they cannot complete the thing that gets them approved.
    """
    if user.role == "admin":
        return user

    result = await db.execute(
        select(WorkerProfile.verification_status).where(WorkerProfile.user_id == user.id)
    )
    status = result.scalar_one_or_none()

    if status is None:
        raise HTTPException(status_code=403, detail="Worker access required")

    if status != "approved":
        # 403 with a status-specific message so the client can show the right
        # thing rather than a generic "forbidden" — a rejected worker needs to
        # be pointed at reapply, a pending one just needs to wait.
        detail = {
            "pending": "Your worker profile is still being verified. You'll be able to do this once approved.",
            "rejected": "Your worker application was not approved. Update your profile and reapply.",
            "suspended": "Your worker account is suspended. Contact support.",
        }.get(status, "Your worker profile is not approved yet.")
        raise HTTPException(status_code=403, detail=detail)

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


async def user_response_with_prefs(db: AsyncSession, user: User) -> "UserResponse":
    """
    Serialise a User together with their UI preferences (language, active_mode).

    Exists because `UserResponse.model_validate(user)` silently succeeds without
    them: `language` and `active_mode` live on `user_preferences`, not on the
    User row, and both fields have defaults on the schema — so every response
    would have quietly claimed "en"/"customer" forever, and the client would
    never learn the user's real choice. A wrong-but-valid payload is the worst
    kind, so this is centralised rather than repeated at the four call sites
    (/auth/provision, /auth/me, /users/me, PATCH /users/me).

    A user with no preferences row yet is normal (the row is created lazily on
    first write), and the schema defaults are correct for that case.
    """
    from models import UserPreference
    from schemas import UserResponse

    payload = UserResponse.model_validate(user)
    prefs = (await db.execute(
        select(UserPreference).where(UserPreference.user_id == user.id)
    )).scalar_one_or_none()
    if prefs:
        payload.language = prefs.language or "en"
        payload.active_mode = prefs.active_mode or "customer"
    return payload
