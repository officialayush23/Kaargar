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
    print("WARNING: SUPABASE_JWT_SECRET not found, auth will fail.")

# Cache for decoded tokens
_TOKEN_CACHE = TTLCache(maxsize=4096, ttl=300)

def _cache_key(token: str) -> str:
    return token

def verify_and_decode_jwt(token: str) -> Dict[str, Any]:
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

    if SUPABASE_ISSUER:
        iss = payload.get("iss", "")
        if not iss.startswith(SUPABASE_ISSUER):
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
    if not token_str:
        return False
    if not SUPABASE_SERVICE_ROLE_KEY:
        return False
    return token_str == SUPABASE_SERVICE_ROLE_KEY