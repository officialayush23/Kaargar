"""
Geocoding router — wraps Mapbox's Geocoding v6 API.

Migrated off Google Places/Geocoding (the user reported Places had stopped
working — likely billing/API-enablement drift on the Google Cloud project).
Mapbox was already the app's map-rendering vendor (VITE_MAPBOX_TOKEN is used
by PuneMap/JobTrackingMap/SearchingPage for tiles), so this consolidates
geocoding onto the same vendor/account instead of adding a third — same
100k-request/month free tier, single key to manage, decent India coverage.

GET  /v1/geocode/forward?address=...           → { lat, lon, formatted_address, place_id }
GET  /v1/geocode/reverse?lat=...&lon=...       → { formatted_address, area, city }
GET  /v1/geocode/autocomplete?input=...        → [{ description, place_id, main_text, secondary_text }]
GET  /v1/geocode/place?place_id=...            → { lat, lon, formatted_address, name }

Response shapes are unchanged from the old Google-backed version, so
FRONTEND/src/hooks/useGeocoding.js and every caller (MapLocationPicker,
NewJobPage, BookDiscoveryPage, AddressModal, ...) needed zero changes.

Mapbox's v6 forward-geocoding response already returns full coordinates per
suggestion (unlike Google Places autocomplete, which only returns a
place_id you then have to resolve separately) — so instead of adding a
second "place details" API call, `place_id` returned from /autocomplete and
/forward is a small base64-encoded JSON blob carrying {lat, lon, address,
name} directly. /place just decodes it — no extra network round-trip, no
extra API surface to keep in sync with Mapbox.
"""

import base64
import json
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

MAPBOX_GEOCODE_BASE = "https://api.mapbox.com/search/geocode/v6"

# Pune bias center — kept from the old Google implementation's fixed radius
# bias, since this app is Pune-only today.
PUNE_LON, PUNE_LAT = 73.8567, 18.5204


def _token() -> str:
    if not settings.mapbox_access_token:
        raise HTTPException(503, "Geocoding service not configured (MAPBOX_ACCESS_TOKEN missing)")
    return settings.mapbox_access_token


def _encode_place_id(lat: float, lon: float, address: str | None, name: str | None) -> str:
    payload = json.dumps({"lat": lat, "lon": lon, "address": address, "name": name})
    return base64.urlsafe_b64encode(payload.encode()).decode()


def _decode_place_id(place_id: str) -> dict:
    try:
        raw = base64.urlsafe_b64decode(place_id.encode()).decode()
        return json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid place_id")


def _feature_to_result(feature: dict) -> dict:
    coords = feature.get("geometry", {}).get("coordinates", [None, None])
    lon, lat = coords[0], coords[1]
    props = feature.get("properties", {})
    address = props.get("full_address") or props.get("place_formatted") or props.get("name")
    name = props.get("name")
    return {"lat": lat, "lon": lon, "address": address, "name": name}


@router.get("/forward")
async def geocode_forward(address: str = Query(..., min_length=3)):
    """Convert a text address to lat/lon. Restricted to India, biased to Pune."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{MAPBOX_GEOCODE_BASE}/forward", params={
                "q": address,
                "country": "in",
                "proximity": f"{PUNE_LON},{PUNE_LAT}",
                "limit": 1,
                "access_token": _token(),
            })
        if resp.status_code != 200:
            logger.warning("Mapbox forward geocode HTTP %s", resp.status_code)
            return {"results": []}
        features = resp.json().get("features", [])
        if not features:
            return {"results": []}
        r = _feature_to_result(features[0])
        if r["lat"] is None:
            return {"results": []}
        return {
            "lat": r["lat"],
            "lon": r["lon"],
            "formatted_address": r["address"],
            "place_id": _encode_place_id(r["lat"], r["lon"], r["address"], r["name"]),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Mapbox forward geocode exception: %s", e)
        return {"results": []}


@router.get("/reverse")
async def geocode_reverse(lat: float = Query(...), lon: float = Query(...)):
    """Convert lat/lon to a human-readable address."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{MAPBOX_GEOCODE_BASE}/reverse", params={
                "longitude": lon,
                "latitude": lat,
                "access_token": _token(),
            })
        if resp.status_code != 200:
            logger.warning("Mapbox reverse geocode HTTP %s", resp.status_code)
            return {"formatted_address": None, "area": None, "city": "Pune"}
        features = resp.json().get("features", [])
        if not features:
            return {"formatted_address": None, "area": None, "city": "Pune"}
        props = features[0].get("properties", {})
        context = props.get("context", {})
        area = (
            (context.get("neighborhood") or {}).get("name")
            or (context.get("locality") or {}).get("name")
            or (context.get("district") or {}).get("name")
        )
        city = (context.get("place") or {}).get("name") or "Pune"
        return {
            "formatted_address": props.get("full_address") or props.get("place_formatted"),
            "area": area,
            "city": city,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Mapbox reverse geocode exception: %s", e)
        return {"formatted_address": None, "area": None, "city": "Pune"}


@router.get("/autocomplete")
async def place_autocomplete(input: str = Query(..., min_length=2)):
    """
    Address autocomplete via Mapbox's forward-geocoding endpoint with
    autocomplete=true — Mapbox returns full suggestions (with coordinates)
    directly from this one call, so there's no separate "session token +
    suggest + retrieve" dance needed the way Google Places required.
    Falls back to an empty list on any error — never returns 502.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{MAPBOX_GEOCODE_BASE}/forward", params={
                "q": input,
                "autocomplete": "true",
                "country": "in",
                "proximity": f"{PUNE_LON},{PUNE_LAT}",
                "limit": 8,
                "access_token": _token(),
            })
        if resp.status_code != 200:
            logger.warning("Mapbox autocomplete HTTP %s", resp.status_code)
            return []
        features = resp.json().get("features", [])
        results = []
        for f in features:
            r = _feature_to_result(f)
            if r["lat"] is None:
                continue
            props = f.get("properties", {})
            results.append({
                "description": r["address"] or r["name"] or "",
                "place_id": _encode_place_id(r["lat"], r["lon"], r["address"], r["name"]),
                "main_text": r["name"] or (r["address"] or "").split(",")[0].strip(),
                "secondary_text": props.get("place_formatted", ""),
            })
        return results
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Mapbox autocomplete exception: %s", e)
        return []


@router.get("/place")
async def place_details(place_id: str = Query(...)):
    """
    Resolve a place_id back to lat/lon + address. Since /autocomplete and
    /forward already encode the full result into place_id (see module
    docstring), this is a pure local decode — no Mapbox call needed.
    """
    decoded = _decode_place_id(place_id)
    if decoded.get("lat") is None or decoded.get("lon") is None:
        raise HTTPException(400, "Invalid place_id")
    return {
        "lat": decoded["lat"],
        "lon": decoded["lon"],
        "formatted_address": decoded.get("address"),
        "name": decoded.get("name"),
    }
