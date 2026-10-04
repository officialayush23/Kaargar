"""
Per-IP fixed-window rate limiting, backed by the Redis we already run (Upstash).

WHY A SMALL MIDDLEWARE INSTEAD OF slowapi
-----------------------------------------
- No new dependency: `redis` (with redis.asyncio) is already in requirements.txt.
- One place to reason about limits, instead of decorators scattered over 164 routes.
- Fails OPEN, like every other Redis use in this codebase (dispatch lock,
  translation cache): if REDIS_URL is unset or Upstash is unreachable, requests
  pass through untouched. Rate limiting is abuse protection, not a correctness
  dependency — it must never take the API down.

COST: one INCR (+ one EXPIRE on the first hit of a window) per request. Upstash
free tier is 10k commands/day; at real traffic this moves to the pay-as-you-go
tier (~$0.2 per 100k commands). Health checks and CORS preflights are skipped.

Limits are per client IP per 60s window, grouped by path prefix. The client IP
is the first X-Forwarded-For entry — Render terminates TLS at its proxy, so
`request.client.host` is always the proxy's address.
"""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from config import get_settings

logger = logging.getLogger(__name__)

WINDOW_SECONDS = 60

# (path prefix, max requests per window). First match wins — keep the most
# specific / most expensive prefixes first.
_RULES: list[tuple[str, int]] = [
    ("/v1/auth", 20),        # provision / me — brute-force and signup-spam surface
    ("/v1/upload", 20),      # writes to Storage, up to 100 MB each
    ("/v1/geocode", 60),     # proxies Mapbox — 100k/month free tier
    ("/v1/translate", 60),   # proxies Sarvam — paid per character
    ("/v1/payments", 30),
    ("/v1/admin", 300),      # admin dashboard pages fire many reads at once
    ("/v1", 240),            # everything else
]

_SKIP_PATHS = {"/health", "/"}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rule_for(path: str) -> tuple[str, int] | None:
    for prefix, limit in _RULES:
        if path.startswith(prefix):
            return prefix, limit
    return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self._redis = None
        url = get_settings().redis_url
        if url:
            try:
                import redis.asyncio as aioredis
                self._redis = aioredis.from_url(url, socket_timeout=0.5, socket_connect_timeout=0.5)
            except Exception as e:  # pragma: no cover - import/config failure
                logger.warning("Rate limiter disabled — Redis init failed: %s", e)

    async def dispatch(self, request: Request, call_next):
        if self._redis is None or request.method == "OPTIONS" or request.url.path in _SKIP_PATHS:
            return await call_next(request)

        rule = _rule_for(request.url.path)
        if rule is None:
            return await call_next(request)

        prefix, limit = rule
        window = int(time.time()) // WINDOW_SECONDS
        key = f"rl:{prefix}:{_client_ip(request)}:{window}"
        try:
            count = await self._redis.incr(key)
            if count == 1:
                await self._redis.expire(key, WINDOW_SECONDS + 5)
        except Exception as e:
            # Fail open — see module docstring.
            logger.debug("Rate limiter skipped (Redis error): %s", e)
            return await call_next(request)

        if count > limit:
            retry_after = WINDOW_SECONDS - (int(time.time()) % WINDOW_SECONDS)
            return JSONResponse(
                {"detail": "Too many requests — please slow down and try again shortly."},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
        return await call_next(request)
