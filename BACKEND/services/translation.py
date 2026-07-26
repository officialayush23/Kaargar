"""
Translation service — Sarvam AI (/translate) + Redis cache.

Migrated off Groq's llama-3.1-8b-instant (generic chat-completion prompted
to translate) onto Sarvam AI's purpose-built Translation API, which is
specifically tuned for Indic languages — a better fit for an app that only
ever translates English/Hindi/Marathi. The caching layers (Redis + the
durable content_translations Postgres table) and every public function
signature below are unchanged, so no caller anywhere else in the codebase
needed to change.

Flow:
  1. Check Redis cache (key: trans:{md5_of_text}:{lang})
  2. If miss → call Sarvam's /translate → store result in Redis (TTL 7 days) + DB
  3. Return translated text

Usage:
  translated = await translate_text("Hello world", "hi")  # → "नमस्ते दुनिया"

Dynamic content (services, packages, etc.) is translated on save via
background tasks — so reads are always instant (pre-translated from DB).
This service is only called during that background translation step.
"""

import hashlib
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Sarvam's language codes are BCP-47-ish with an -IN region suffix.
SARVAM_LANG_CODES = {
    "hi": "hi-IN",
    "mr": "mr-IN",
}

SUPPORTED_LANGS = {"en", "hi", "mr"}

# ---------------------------------------------------------------------------
# Redis helper (optional — graceful degradation if Redis unavailable)
# ---------------------------------------------------------------------------

async def _get_redis():
    try:
        import redis.asyncio as aioredis
        from config import get_settings
        settings = get_settings()
        if not settings.redis_url:
            return None
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        await r.ping()
        return r
    except Exception:
        return None


def _cache_key(text: str, lang: str) -> str:
    h = hashlib.md5(text.encode("utf-8")).hexdigest()
    return f"trans:{h}:{lang}"


# ---------------------------------------------------------------------------
# Core translation via Groq
# ---------------------------------------------------------------------------

async def translate_text(text: str, target_lang: str) -> str:
    """
    Translate `text` to `target_lang` ('en' | 'hi' | 'mr').
    Returns original text if translation fails or lang is unsupported.
    Results are Redis-cached for 7 days.
    """
    if not text or not text.strip():
        return text

    if target_lang not in SUPPORTED_LANGS:
        return text

    if target_lang == "en":
        # Assume original content is the English version — no API call needed
        return text

    cache_key = _cache_key(text, target_lang)

    # 1. Try Redis cache
    r = await _get_redis()
    if r:
        try:
            cached = await r.get(cache_key)
            if cached:
                await r.aclose()
                return cached
        except Exception:
            pass

    # 2. Call Sarvam
    translated = await _call_sarvam(text, target_lang)

    # 3. Cache result in Redis (7 days)
    if r and translated != text:
        try:
            await r.setex(cache_key, 604_800, translated)
        except Exception:
            pass
        finally:
            await r.aclose()

    return translated


SARVAM_TRANSLATE_URL = "https://api.sarvam.ai/translate"
# Sarvam's mayura:v1 model caps input at 1000 chars; service/package titles
# and descriptions are short, so this is generous headroom, not a real limit.
SARVAM_MAX_CHARS = 1000


async def _call_sarvam(text: str, target_lang: str) -> str:
    """Call Sarvam AI's /translate endpoint. Returns original text on any error."""
    try:
        from config import get_settings
        settings = get_settings()

        if not settings.sarvam_api_key:
            logger.warning("SARVAM_API_KEY not set — skipping translation")
            return text

        if len(text) > SARVAM_MAX_CHARS:
            logger.warning("Text too long for Sarvam translate (%d chars) — skipping", len(text))
            return text

        import httpx

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                SARVAM_TRANSLATE_URL,
                headers={
                    "api-subscription-key": settings.sarvam_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "input": text,
                    "source_language_code": "auto",
                    "target_language_code": SARVAM_LANG_CODES[target_lang],
                    "model": "sarvam-translate:v1",
                    "mode": "formal",
                },
            )

        if resp.status_code != 200:
            logger.error("Sarvam translate HTTP %s: %s", resp.status_code, resp.text[:200])
            return text

        data = resp.json()
        translated = (data.get("translated_text") or "").strip()
        if not translated:
            return text

        # Sanity check — if Sarvam returns something suspiciously long, fall back
        if len(translated) > len(text) * 5:
            logger.warning("Translation result suspiciously long — using original")
            return text

        return translated

    except Exception as e:
        logger.error(f"Sarvam translation failed for lang={target_lang}: {e}")
        return text  # Graceful degradation — never crash on translation failure


# ---------------------------------------------------------------------------
# Batch translate an entity's fields and persist to DB
# ---------------------------------------------------------------------------

async def translate_and_store(
    entity_type: str,
    entity_id: str,
    fields: dict[str, str],  # {"title": "...", "description": "..."}
    source_lang: str = "en",
) -> None:
    """
    Translate all `fields` to the missing languages and store in content_translations.
    Called as a background task via FastAPI's BackgroundTasks — which run
    *after* the HTTP response has been sent, at which point the request's own
    `db: AsyncSession` (from `get_db`) has already been closed by that
    dependency's teardown. This function therefore opens its OWN fresh
    session from `database.async_session` rather than accepting one from the
    caller — a previous version accepted `db` from the request and reused it
    here, which crashed every service/package/offer create-or-update that
    included a title/description with `sqlalchemy.exc.IllegalStateChangeError`
    the moment this background task's `db.execute`/`db.commit` ran against an
    already-closed session (the same bug class later found in
    `routers/search.py`'s `/search` endpoint).

    This is also genuinely worth keeping as a background task (not just
    awaiting it inline) since it makes real external Groq API calls per
    field/language and shouldn't add that latency to the save request.

    Args:
        entity_type: 'service' | 'package' | 'offer' | 'review'
        entity_id: UUID string
        fields: dict of field_name → original_text
        source_lang: the language the worker wrote in (default 'en')
    """
    from sqlalchemy import text as sql_text
    from database import async_session

    # Every supported language is stored, including the source language
    # (as-is, untranslated) — so a read never has to fall back or guess.
    all_langs = list(SUPPORTED_LANGS)

    try:
        async with async_session() as db:
            for field_name, original_text in fields.items():
                if not original_text or not original_text.strip():
                    continue

                for lang in all_langs:
                    if lang == source_lang:
                        translated = original_text  # Store original as-is
                    else:
                        translated = await translate_text(original_text, lang)

                    # Upsert into content_translations
                    await db.execute(
                        sql_text("""
                            INSERT INTO content_translations
                                (entity_type, entity_id, language, field, text)
                            VALUES
                                (:entity_type, :entity_id, :language, :field, :text)
                            ON CONFLICT (entity_type, entity_id, language, field)
                            DO UPDATE SET text = EXCLUDED.text, updated_at = now()
                        """),
                        {
                            "entity_type": entity_type,
                            "entity_id": entity_id,
                            "language": lang,
                            "field": field_name,
                            "text": translated,
                        },
                    )

            await db.commit()
    except Exception as exc:
        logger.error(f"translate_and_store failed for {entity_type} {entity_id}: {exc}")


async def get_translation(
    db,
    entity_type: str,
    entity_id: str,
    field: str,
    lang: str = "en",
) -> Optional[str]:
    """Fetch a single translated field from DB. Returns None if not found."""
    from sqlalchemy import text as sql_text

    result = await db.execute(
        sql_text("""
            SELECT text FROM content_translations
            WHERE entity_type = :entity_type
              AND entity_id   = :entity_id
              AND language    = :language
              AND field       = :field
            LIMIT 1
        """),
        {
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "language": lang,
            "field": field,
        },
    )
    row = result.fetchone()
    return row[0] if row else None
