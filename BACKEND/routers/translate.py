"""
Translate router — app-language (UI string) translation.

Distinct from the existing translate-on-save path for dynamic content
(services/packages/offers, handled by services.translation.translate_and_store
as a background task). This endpoint serves *interface* strings — button
labels, headings, empty states — which can't be pre-translated at write time
because they don't live in the database at all; they live in the client bundle.

COST MODEL (this is why the endpoint looks the way it does)
-----------------------------------------------------------
Sarvam is billed per call, so an endpoint that translates arbitrary text on
demand is a spend faucet. Three things keep it bounded:

  1. Auth required. An unauthenticated translate endpoint is a billing DoS —
     anyone could burn the Sarvam quota from a loop.
  2. Every result is cached twice — Redis (7 days, via translate_text) and
     `content_translations` (permanent). The set of UI strings is finite and
     changes only when the app ships a new build, so total spend converges to
     "number of distinct UI strings x 2 languages", paid once, ever.
  3. MAX_BATCH caps a single request.

The client caches on top of this in AsyncStorage, so a returning user makes
zero calls for strings they've already seen.

`content_translations` is reused rather than given its own table: entity_id is
a UUID column and UI strings have no id, so the key is a deterministic
uuid5(namespace, text). Same string always maps to the same row, no migration
needed, and the durable cache survives a Redis flush.
"""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models import ContentTranslation, User
from services.translation import SUPPORTED_LANGS, translate_text

router = APIRouter()
logger = logging.getLogger(__name__)

# Stable namespace for hashing UI strings into content_translations.entity_id.
# Do not change this value — it would orphan every cached UI translation.
UI_NAMESPACE = uuid.UUID("6ba7b811-9dad-11d1-80b4-00c04fd430c8")

ENTITY_TYPE = "ui"
FIELD = "string"

# One screen's worth of strings, generously. Bounds both per-request Sarvam
# spend and response time (misses are translated sequentially).
MAX_BATCH = 120


class UITranslateRequest(BaseModel):
    lang: str
    strings: list[str] = Field(default_factory=list)


class UITranslateResponse(BaseModel):
    lang: str
    # source string -> translated string
    translations: dict[str, str]


def _ui_id(text: str) -> uuid.UUID:
    return uuid.uuid5(UI_NAMESPACE, text)


@router.post("/ui", response_model=UITranslateResponse)
async def translate_ui(
    body: UITranslateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lang = (body.lang or "").strip().lower()
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(422, f"Unsupported language '{body.lang}'")

    # English is the source language — nothing to do, and importantly no
    # Sarvam call. The client shouldn't ask, but it costs nothing to be sure.
    if lang == "en":
        return UITranslateResponse(lang=lang, translations={})

    # De-duplicate while preserving order, drop blanks.
    seen: set[str] = set()
    strings: list[str] = []
    for s in body.strings:
        s = (s or "").strip()
        if s and s not in seen:
            seen.add(s)
            strings.append(s)

    if not strings:
        return UITranslateResponse(lang=lang, translations={})
    if len(strings) > MAX_BATCH:
        raise HTTPException(422, f"Too many strings in one request (max {MAX_BATCH})")

    by_id = {_ui_id(s): s for s in strings}

    # 1. Durable cache first — one query for the whole batch.
    rows = (await db.execute(
        select(ContentTranslation).where(
            ContentTranslation.entity_type == ENTITY_TYPE,
            ContentTranslation.language == lang,
            ContentTranslation.field == FIELD,
            ContentTranslation.entity_id.in_(list(by_id.keys())),
        )
    )).scalars().all()

    out: dict[str, str] = {}
    for row in rows:
        src = by_id.get(row.entity_id)
        if not src:
            continue
        # A human override always beats the machine translation. The machine
        # text is kept in `text` so an override can be reverted without
        # re-paying Sarvam.
        out[src] = row.manual_text or row.text
        # Opportunistic backfill: this request carries the English source, and
        # rows written before `source_text` existed have no way to recover it
        # (entity_id is a one-way uuid5 of the text). Filling it here closes the
        # gap as the app is used, instead of a migration that cannot know the
        # answer. Deliberately does not touch updated_at semantics beyond the
        # normal flush — see the commit below.
        if row.source_text is None:
            row.source_text = src

    # 2. Misses go to Sarvam (which has its own Redis layer in front of it).
    misses = [s for s in strings if s not in out]
    for src in misses:
        try:
            translated = await translate_text(src, lang)
        except Exception:
            # translate_text already degrades gracefully, but never let one
            # bad string fail a whole screen's worth of copy.
            logger.exception("UI translation failed for %r (%s)", src[:40], lang)
            continue

        # translate_text returns the input unchanged when it can't translate
        # (no API key, HTTP error, text too long). Don't persist that — it
        # would poison the permanent cache with untranslated English and the
        # string would never be retried after the key is fixed.
        if not translated or translated == src:
            continue

        out[src] = translated
        db.add(ContentTranslation(
            entity_type=ENTITY_TYPE,
            entity_id=_ui_id(src),
            language=lang,
            field=FIELD,
            text=translated,
            source_text=src,
        ))

    # Commit if there were misses to persist OR if the loop above backfilled a
    # `source_text` on an existing row. Gating this on `misses` alone (as it
    # was) would silently discard every backfill on a request that was a
    # complete cache hit — which is the common case, so the column would have
    # stayed empty almost forever.
    if misses or db.dirty:
        await db.commit()

    return UITranslateResponse(lang=lang, translations=out)


# ── DELTA SYNC ────────────────────────────────────────────────────────────────
#
# Lets a client hold its dictionary in local storage and ask "has anything
# changed?" for the price of one tiny request, instead of either re-fetching
# everything on launch or never learning about corrections at all.
#
# WHY max(updated_at) AND NOT A VERSION TABLE
# A `translation_versions(language, version)` row would have to be bumped on
# every write — a second thing to keep correct, and a new way for the version
# to disagree with the rows it describes. `max(updated_at)` IS that number,
# derived from the data itself, and it gives `WHERE updated_at > :since` for
# free. Served as epoch milliseconds so the client can store a plain integer.
#
# Realtime is deliberately NOT used. Polling one integer on launch and on
# foreground is enough for "a corrected string reaches phones within a
# session", and it costs no socket, no subscription and no RLS surface.


class TranslationVersionResponse(BaseModel):
    lang: str
    version: int


class TranslationSyncResponse(BaseModel):
    lang: str
    version: int
    translations: dict[str, str]
    truncated: bool = False


# Bounds one sync response. A client that is further behind than this simply
# syncs again — `version` in the reply is the high-water mark of what was
# actually sent, so the next call resumes from exactly there.
SYNC_PAGE = 500


def _version_ms(value) -> int:
    return int(value.timestamp() * 1000) if value else 0


@router.get("/version", response_model=TranslationVersionResponse)
async def translation_version(
    lang: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cheapest possible "is my dictionary stale?" probe."""
    lang = (lang or "").strip().lower()
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(422, f"Unsupported language '{lang}'")

    newest = await db.scalar(
        select(func.max(ContentTranslation.updated_at)).where(
            ContentTranslation.entity_type == ENTITY_TYPE,
            ContentTranslation.language == lang,
        )
    )
    return TranslationVersionResponse(lang=lang, version=_version_ms(newest))


@router.get("/sync", response_model=TranslationSyncResponse)
async def translation_sync(
    lang: str,
    since: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Everything that changed after `since` (epoch ms). `since=0` returns the
    whole dictionary, which is what a fresh install wants.

    Only rows with a `source_text` can be returned: the client dictionary is
    keyed by the English string, and a row without it cannot be placed. Rows
    predating that column fill in as `/ui` serves them (see the backfill in
    translate_ui), so this set grows to completeness on its own.
    """
    lang = (lang or "").strip().lower()
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(422, f"Unsupported language '{lang}'")
    if lang == "en":
        return TranslationSyncResponse(lang=lang, version=0, translations={})

    from datetime import datetime, timezone as _tz

    cutoff = datetime.fromtimestamp(max(since, 0) / 1000, tz=_tz.utc)

    rows = (await db.execute(
        select(ContentTranslation)
        .where(
            ContentTranslation.entity_type == ENTITY_TYPE,
            ContentTranslation.language == lang,
            ContentTranslation.updated_at > cutoff,
            ContentTranslation.source_text.is_not(None),
        )
        .order_by(ContentTranslation.updated_at)
        .limit(SYNC_PAGE + 1)
    )).scalars().all()

    truncated = len(rows) > SYNC_PAGE
    if truncated:
        rows = rows[:SYNC_PAGE]

    translations = {r.source_text: (r.manual_text or r.text) for r in rows if r.source_text}
    # High-water mark of what was actually sent, NOT the table's max — sending
    # the table max while withholding rows would make the client believe it is
    # up to date and permanently skip the remainder.
    version = _version_ms(rows[-1].updated_at) if rows else max(since, 0)

    return TranslationSyncResponse(
        lang=lang, version=version, translations=translations, truncated=truncated
    )
