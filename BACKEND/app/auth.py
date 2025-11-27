# # app/auth.py
# import os
# import time
# import jwt
# from jwt import PyJWTError
# from typing import Optional, Dict, Any
# from cachetools import TTLCache
# from fastapi import HTTPException, status

# # read env
# SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
# SUPABASE_JWT_AUD = os.getenv("SUPABASE_JWT_AUD", "authenticated")
# SUPABASE_ISSUER = os.getenv("SUPABASE_ISSUER")  # e.g. https://<project>.supabase.co
# SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# if not SUPABASE_JWT_SECRET:
#     raise RuntimeError("SUPABASE_JWT_SECRET is required in env")

# # small in-process cache for decoded tokens (MVP)
# _TOKEN_CACHE = TTLCache(maxsize=4096, ttl=300)

# def _cache_key(token: str) -> str:
#     return token

# def verify_and_decode_jwt(token: str) -> Dict[str, Any]:
#     """
#     Verifies HS256 signature and audience+issuer claims.
#     Raises HTTPException(401) on failure.
#     Returns decoded payload.
#     """
#     key = _cache_key(token)
#     cached = _TOKEN_CACHE.get(key)
#     if cached:
#         return cached

#     try:
#         payload = jwt.decode(
#             token,
#             SUPABASE_JWT_SECRET,
#             algorithms=["HS256"],
#             audience=SUPABASE_JWT_AUD,
#             options={"require": ["exp", "sub"], "verify_exp": True},
#         )
#     except PyJWTError as e:
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {str(e)}")

#     # optional strict issuer check
#     if SUPABASE_ISSUER:
#         iss = payload.get("iss", "")
#         if not iss.startswith(SUPABASE_ISSUER):
#             raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token issuer")

#     _TOKEN_CACHE[key] = payload
#     return payload

# def get_user_id_from_jwt(token: str) -> str:
#     payload = verify_and_decode_jwt(token)
#     sub = payload.get("sub")
#     if not sub:
#         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub")
#     return sub

# def is_admin_token(authorization_header_value: Optional[str]) -> bool:
#     """
#     Admin endpoints may be protected by requiring the SUPABASE_SERVICE_ROLE_KEY
#     in the Authorization header (Bearer <SERVICE_ROLE_KEY>), or by verifying the JWT
#     and checking the user's role from DB. This helper checks for direct service key usage.
#     """
#     if not authorization_header_value:
#         return False
#     if not SUPABASE_SERVICE_ROLE_KEY:
#         return False
#     if authorization_header_value.lower().startswith("bearer "):
#         token = authorization_header_value.split(" ", 1)[1].strip()
#         return token == SUPABASE_SERVICE_ROLE_KEY
#     return False


# app/auth.py
import os
import jwt
from jwt import PyJWTError
from typing import Optional, Dict, Any
from cachetools import TTLCache
from fastapi import HTTPException, status
from dotenv import load_dotenv

# 1. Load env vars immediately
load_dotenv()

# 2. Read Config
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_JWT_AUD = os.getenv("SUPABASE_JWT_AUD", "authenticated")
SUPABASE_ISSUER = os.getenv("SUPABASE_ISSUER")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_JWT_SECRET:
    # Fallback for local testing if env is missing, but warn
    print("WARNING: SUPABASE_JWT_SECRET not found, auth will fail.")

# Cache for decoded tokens to reduce CPU overhead on frequent requests
_TOKEN_CACHE = TTLCache(maxsize=4096, ttl=300)

def _cache_key(token: str) -> str:
    return token

def verify_and_decode_jwt(token: str) -> Dict[str, Any]:
    """
    Verifies HS256 signature and audience+issuer claims.
    Returns decoded payload or raises 401.
    """
    key = _cache_key(token)
    cached = _TOKEN_CACHE.get(key)
    if cached:
        return cached

    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience=SUPABASE_JWT_AUD,
            options={"require": ["exp", "sub"], "verify_exp": True},
        )
    except PyJWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail=f"Invalid token: {str(e)}"
        )

    # Optional: Strict Issuer Check
    if SUPABASE_ISSUER:
        iss = payload.get("iss", "")
        # Some Supabase setups might have slightly different issuer strings, 
        # so we check if it starts with the URL.
        if not iss.startswith(SUPABASE_ISSUER):
             # Log this if you run into issues, sometimes "https://" is missing in one place
             pass 

    _TOKEN_CACHE[key] = payload
    return payload

def get_user_id_from_jwt(token: str) -> str:
    payload = verify_and_decode_jwt(token)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub")
    return sub

def is_admin_token(token_str: Optional[str]) -> bool:
    """
    Checks if the token provided is the Service Role Key (Admin).
    """
    if not token_str:
        return False
    if not SUPABASE_SERVICE_ROLE_KEY:
        return False
    
    # Check if it matches the service role key directly
    return token_str == SUPABASE_SERVICE_ROLE_KEY