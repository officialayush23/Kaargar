"""
Geocoding router — wraps Google Maps APIs.
GET  /v1/geocode/forward?address=...           → { lat, lon, formatted_address, place_id }
GET  /v1/geocode/reverse?lat=...&lon=...       → { formatted_address, area, city }
GET  /v1/geocode/autocomplete?input=...        → [{ description, place_id, main_text, secondary_text }]
GET  /v1/geocode/place?place_id=...            → { lat, lon, formatted_address }
"""

import httpx
import logging
from fastapi import APIRouter, HTTPException, Query
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter()

GMAPS_BASE      = "https://maps.googleapis.com/maps/api"
PLACES_NEW_BASE = "https://places.googleapis.com/v1"

# In-memory API availability flags — reset on server restart.
# Avoids hammering disabled APIs on every keystroke.
_places_new_available  = True   # Places API (New)
_places_legacy_available = True  # Legacy Places Autocomplete


def _key() -> str:
    if not settings.google_maps_api_key:
        raise HTTPException(503, "Geocoding service not configured (GOOGLE_MAPS_API_KEY missing)")
    return settings.google_maps_api_key


@router.get("/forward")
async def geocode_forward(address: str = Query(..., min_length=3)):
    """Convert a text address to lat/lon. Restricted to India."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{GMAPS_BASE}/geocode/json", params={
                "address": address,
                "region": "in",
                "components": "country:IN",
                "key": _key(),
            })
        data = resp.json()
        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            logger.warning("Geocode forward error: %s", data.get("status"))
            return {"results": []}
        results = data.get("results", [])
        if not results:
            return {"results": []}
        top = results[0]
        loc = top["geometry"]["location"]
        return {
            "lat": loc["lat"],
            "lon": loc["lng"],
            "formatted_address": top["formatted_address"],
            "place_id": top.get("place_id"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Geocode forward exception: %s", e)
        return {"results": []}


@router.get("/reverse")
async def geocode_reverse(lat: float = Query(...), lon: float = Query(...)):
    """Convert lat/lon to a human-readable address."""
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{GMAPS_BASE}/geocode/json", params={
                "latlng": f"{lat},{lon}",
                "key": _key(),
                "result_type": "street_address|route|sublocality|locality",
            })
        data = resp.json()
        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            logger.warning("Reverse geocode error: %s", data.get("status"))
            return {"formatted_address": None, "area": None, "city": "Pune"}
        results = data.get("results", [])
        if not results:
            return {"formatted_address": None, "area": None, "city": "Pune"}
        top = results[0]
        components = {
            c["types"][0]: c["long_name"]
            for c in top.get("address_components", [])
            if c.get("types")
        }
        area = (
            components.get("sublocality_level_1")
            or components.get("sublocality")
            or components.get("neighborhood")
        )
        return {
            "formatted_address": top["formatted_address"],
            "area": area,
            "city": components.get("locality", "Pune"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Reverse geocode exception: %s", e)
        return {"formatted_address": None, "area": None, "city": "Pune"}


@router.get("/autocomplete")
async def place_autocomplete(input: str = Query(..., min_length=2)):
    """
    Place autocomplete using Places API (New).
    Falls back to empty list on any error — never returns 502.
    """
    key = _key()

    global _places_new_available, _places_legacy_available

    # ── Try Places API (New) first ───────────────────────────────
    if _places_new_available:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.post(
                    f"{PLACES_NEW_BASE}/places:autocomplete",
                    headers={"X-Goog-Api-Key": key, "Content-Type": "application/json"},
                    json={
                        "input": input,
                        "locationBias": {
                            "circle": {
                                "center": {"latitude": 18.5204, "longitude": 73.8567},
                                "radius": 30000.0,
                            }
                        },
                        "includedRegionCodes": ["in"],
                    },
                )
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for s in data.get("suggestions", [])[:8]:
                    p = s.get("placePrediction", {})
                    if not p:
                        continue
                    text = p.get("text", {}).get("text", "")
                    sf = p.get("structuredFormat", {})
                    results.append({
                        "description": text,
                        "place_id": p.get("placeId", ""),
                        "main_text": sf.get("mainText", {}).get("text", text),
                        "secondary_text": sf.get("secondaryText", {}).get("text", ""),
                    })
                return results
            elif resp.status_code in (403, 400):
                logger.warning("Places API (New) disabled (HTTP %s) — switching to fallback for this session",
                               resp.status_code)
                _places_new_available = False
            else:
                logger.warning("Places API (New) HTTP %s", resp.status_code)
        except Exception as e:
            logger.warning("Places API (New) exception: %s", e)

    # ── Fallback: legacy Places Autocomplete ────────────────────
    if _places_legacy_available:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                resp = await client.get(f"{GMAPS_BASE}/place/autocomplete/json", params={
                    "input": input,
                    "components": "country:in",
                    "location": "18.5204,73.8567",
                    "radius": 30000,
                    "key": key,
                })
            data = resp.json()
            status = data.get("status")
            if status in ("OK", "ZERO_RESULTS"):
                return [
                    {
                        "description": p["description"],
                        "place_id": p["place_id"],
                        "main_text": p.get("structured_formatting", {}).get("main_text", ""),
                        "secondary_text": p.get("structured_formatting", {}).get("secondary_text", ""),
                    }
                    for p in data.get("predictions", [])[:8]
                ]
            else:
                logger.warning("Legacy autocomplete disabled (%s) — switching to geocoding fallback", status)
                _places_legacy_available = False
        except Exception as e:
            logger.error("Legacy autocomplete exception: %s", e)

    # ── Final fallback: Geocoding API (always enabled) ───────────
    # Returns address matches — less precise than Places but works without
    # Places API being enabled.
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{GMAPS_BASE}/geocode/json", params={
                "address": f"{input}, Pune, Maharashtra, India",
                "region": "in",
                "components": "country:IN",
                "key": key,
            })
        data = resp.json()
        if data.get("status") not in ("OK", "ZERO_RESULTS"):
            logger.warning("Geocoding API fallback error: %s", data.get("status"))
            return []
        results = []
        for r in data.get("results", [])[:6]:
            addr = r.get("formatted_address", "")
            place_id = r.get("place_id", "")
            # Split into main (first part) and secondary (rest)
            parts = addr.split(",", 1)
            results.append({
                "description": addr,
                "place_id": place_id,
                "main_text": parts[0].strip(),
                "secondary_text": parts[1].strip() if len(parts) > 1 else "",
            })
        return results
    except Exception as e:
        logger.error("Geocoding API fallback exception: %s", e)
        return []


@router.get("/place")
async def place_details(place_id: str = Query(...)):
    """Resolve a place_id to lat/lon + address. Tries Places API (New) then legacy."""
    key = _key()

    # ── Places API (New) ─────────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                f"{PLACES_NEW_BASE}/places/{place_id}",
                headers={"X-Goog-Api-Key": key},
                params={"fields": "location,displayName,formattedAddress"},
            )
        if resp.status_code == 200:
            data = resp.json()
            loc = data.get("location", {})
            return {
                "lat": loc.get("latitude"),
                "lon": loc.get("longitude"),
                "formatted_address": data.get("formattedAddress"),
                "name": data.get("displayName", {}).get("text"),
            }
        logger.warning("Places API (New) details HTTP %s", resp.status_code)
    except Exception as e:
        logger.warning("Places API (New) details exception: %s — trying legacy", e)

    # ── Fallback: legacy Place Details ───────────────────────────
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(f"{GMAPS_BASE}/place/details/json", params={
                "place_id": place_id,
                "fields": "geometry,formatted_address,name",
                "key": key,
            })
        data = resp.json()
        if data.get("status") != "OK":
            raise HTTPException(502, f"Place details error: {data.get('status')}")
        result = data["result"]
        loc = result["geometry"]["location"]
        return {
            "lat": loc["lat"],
            "lon": loc["lng"],
            "formatted_address": result.get("formatted_address"),
            "name": result.get("name"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Legacy place details exception: %s", e)
        raise HTTPException(502, "Place details unavailable")
