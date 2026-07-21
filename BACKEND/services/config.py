"""
Platform config lookup helper.

Reads tunable business constants from the `platform_config` table (key/value,
both TEXT — see models.PlatformConfig), parsing the stored string into the
same type as the caller's `default`, and falling back to that default if no
row exists for the key (or the row's value fails to parse). This is the
"blank/missing row falls back to hardcoded default" behavior — nothing in
the app should ever hard-fail because an admin hasn't set a row yet.

Caching: these values are read on essentially every dispatch round and every
pricing calculation, so hitting Postgres on every call would be wasteful for
values that change maybe a few times a year. We keep a simple process-local
dict cache with a short TTL (60s) — good enough for a single FastAPI process
(per CLAUDE.md: no Celery/Redis queue, APScheduler in-process) and avoids
any need for cross-process invalidation. A 60s staleness window is an
acceptable tradeoff for admin-tunable constants that are not real-time
safety-critical; if that changes, swap this for a pub/sub invalidation or a
shorter TTL rather than removing the cache entirely.
"""
from __future__ import annotations

import time
from decimal import Decimal, InvalidOperation
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import PlatformConfig

T = TypeVar("T", Decimal, float, int, str)

_CACHE_TTL_SEC = 60
_cache: dict[str, tuple[float, str]] = {}  # key -> (fetched_at_monotonic, raw_value)


def _parse(raw: str, default: T) -> T:
    """Parse `raw` into the same type as `default`. Falls back to `default` on any parse error."""
    try:
        if isinstance(default, Decimal):
            return Decimal(raw)  # type: ignore[return-value]
        if isinstance(default, bool):
            return raw.strip().lower() in ("1", "true", "yes", "on")  # type: ignore[return-value]
        if isinstance(default, int):
            return int(raw)  # type: ignore[return-value]
        if isinstance(default, float):
            return float(raw)  # type: ignore[return-value]
        return raw  # type: ignore[return-value]
    except (InvalidOperation, ValueError, TypeError):
        return default


async def _fetch_raw(db: AsyncSession, key: str) -> str | None:
    now = time.monotonic()
    cached = _cache.get(key)
    if cached is not None and (now - cached[0]) < _CACHE_TTL_SEC:
        return cached[1]

    result = await db.execute(select(PlatformConfig.value).where(PlatformConfig.key == key))
    row = result.scalar_one_or_none()
    if row is not None:
        _cache[key] = (now, row)
        return row

    # No row in DB — don't cache the "miss" as a value; just report it so the
    # caller falls back to its default every time (cheap: a single indexed PK lookup).
    return None


async def get_config(db: AsyncSession, key: str, default: T) -> T:
    """
    Look up `platform_config.value` for `key`, parsed to match the type of
    `default`. Returns `default` if the key is unset or unparseable.
    """
    raw = await _fetch_raw(db, key)
    if raw is None:
        return default
    return _parse(raw, default)


def clear_config_cache() -> None:
    """Test/ops helper — drop all cached values so the next read hits the DB."""
    _cache.clear()
