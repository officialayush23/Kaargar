"""
Real driving ETA via Mapbox's Directions API.

Replaces the old straight-line-distance/20kmh estimate that lived entirely
client-side in JobTrackingMap.jsx. That estimate is kept as an automatic
fallback here (same math, just server-side) for when Mapbox is unreachable
or the token is missing — this should never be a hard dependency for
something as load-bearing as "can the customer see an ETA at all."

Deliberately NOT called on every single GPS ping (workers push a position
every ~3.5s) — that would burn through Mapbox's free tier in minutes for a
single active job. The frontend polls GET /jobs/{id}/eta on its own slower
interval (see JobTrackingMap.jsx) instead of calling this per Realtime tick.
"""
from __future__ import annotations

import logging
import math

import httpx

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

MAPBOX_DIRECTIONS_BASE = "https://api.mapbox.com/directions/v5/mapbox/driving"

AVG_CITY_SPEED_KMH = 20.0  # same fallback constant the old frontend estimate used


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


async def get_driving_eta(
    origin_lat: float, origin_lon: float, dest_lat: float, dest_lon: float,
) -> dict:
    """
    Returns {"duration_min": float, "distance_km": float, "source": "directions"|"straight_line"}.
    Never raises — falls back to straight-line/20kmh on any failure so the
    tracking map always has *something* to show.
    """
    straight_km = _haversine_km(origin_lat, origin_lon, dest_lat, dest_lon)
    fallback = {
        "duration_min": round((straight_km / AVG_CITY_SPEED_KMH) * 60, 1),
        "distance_km": round(straight_km, 2),
        "source": "straight_line",
    }

    token = settings.mapbox_access_token
    if not token:
        return fallback

    try:
        coords = f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
        async with httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(
                f"{MAPBOX_DIRECTIONS_BASE}/{coords}",
                params={
                    "access_token": token,
                    "overview": "false",
                    "alternatives": "false",
                    "steps": "false",
                },
            )
        if resp.status_code != 200:
            logger.warning("Mapbox Directions HTTP %s", resp.status_code)
            return fallback
        data = resp.json()
        routes = data.get("routes", [])
        if not routes:
            return fallback
        route = routes[0]
        return {
            "duration_min": round(route["duration"] / 60, 1),
            "distance_km": round(route["distance"] / 1000, 2),
            "source": "directions",
        }
    except Exception as e:
        logger.warning("Mapbox Directions exception: %s", e)
        return fallback
