"""
Geocoding router — wraps Google Maps Geocoding API.
GET  /v1/geocode/forward?address=...           → { lat, lon, formatted_address, place_id }
GET  /v1/geocode/reverse?lat=...&lon=...       → { formatted_address, area, city }
GET  /v1/geocode/autocomplete?input=...        → [{ description, place_id }]
GET  /v1/geocode/place?place_id=...            → { lat, lon, formatted_address }
"""

import httpx
from fastapi import APIRouter, HTTPException, Query
from config import get_settings

settings = get_settings()
router = APIRouter()

GMAPS_BASE = "https://maps.googleapis.com/maps/api"


def _key() -> str:
    if not settings.google_maps_api_key:
        raise HTTPException(503, "Geocoding service not configured (GOOGLE_MAPS_API_KEY missing)")
    return settings.google_maps_api_key


@router.get("/forward")
async def geocode_forward(address: str = Query(..., min_length=3)):
    """Convert a text address to lat/lon. Restricted to India."""
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(f"{GMAPS_BASE}/geocode/json", params={
            "address": address,
            "region": "in",
            "components": "country:IN",
            "key": _key(),
        })
    data = resp.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise HTTPException(502, f"Geocoding error: {data.get('status')}")
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


@router.get("/reverse")
async def geocode_reverse(
    lat: float = Query(...),
    lon: float = Query(...),
):
    """Convert lat/lon to a human-readable address."""
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(f"{GMAPS_BASE}/geocode/json", params={
            "latlng": f"{lat},{lon}",
            "key": _key(),
            "result_type": "street_address|route|sublocality|locality",
        })
    data = resp.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise HTTPException(502, f"Reverse geocoding error: {data.get('status')}")
    results = data.get("results", [])
    if not results:
        return {"formatted_address": None, "area": None, "city": "Pune"}

    top = results[0]
    components = {c["types"][0]: c["long_name"] for c in top.get("address_components", [])}
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


@router.get("/autocomplete")
async def place_autocomplete(
    input: str = Query(..., min_length=2),
):
    """Return place autocomplete suggestions restricted to Pune, India."""
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(f"{GMAPS_BASE}/place/autocomplete/json", params={
            "input": input,
            "components": "country:in",
            "location": "18.5204,73.8567",   # Pune center
            "radius": 30000,                  # 30 km radius bias
            "strictbounds": False,
            "key": _key(),
        })
    data = resp.json()
    if data.get("status") not in ("OK", "ZERO_RESULTS"):
        raise HTTPException(502, f"Autocomplete error: {data.get('status')}")
    predictions = data.get("predictions", [])
    return [
        {
            "description": p["description"],
            "place_id": p["place_id"],
            "main_text": p.get("structured_formatting", {}).get("main_text", ""),
            "secondary_text": p.get("structured_formatting", {}).get("secondary_text", ""),
        }
        for p in predictions[:8]
    ]


@router.get("/place")
async def place_details(place_id: str = Query(...)):
    """Resolve a place_id to lat/lon + address."""
    async with httpx.AsyncClient(timeout=8) as client:
        resp = await client.get(f"{GMAPS_BASE}/place/details/json", params={
            "place_id": place_id,
            "fields": "geometry,formatted_address,name",
            "key": _key(),
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
