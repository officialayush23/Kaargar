"""
Upload router — Supabase Storage.
POST /upload/profile-photo  → profile_photos bucket
POST /upload/worker-post    → worker_post bucket
DELETE /upload/worker-post/{media_id}
"""

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
import uuid as _uuid

from database import get_db
from models import User, WorkerProfile, ServiceMedia
from schemas import MediaUploadResponse, SuccessResponse
from dependencies import get_current_user
from services.storage import (
    upload_file, delete_file,
    profile_photo_path, worker_post_path, worker_document_path,
    verification_video_path,
    BUCKET_PROFILE, BUCKET_POSTS, BUCKET_DOCUMENTS, BUCKET_VERIFICATION_VIDEO,
)
from services.config import get_config

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_VIDEO_SIZE = 100 * 1024 * 1024


def _safe_upload(bucket: str, path: str, data: bytes, content_type: str) -> str:
    """
    upload_file() was raising an unhandled exception straight out of every
    endpoint here on any Supabase Storage failure (missing bucket, bad
    service-role permissions, network hiccup, etc.) — FastAPI turned that
    into a bare "500 Internal Server Error" with no detail at all, which is
    exactly what was reported for POST /upload/worker-post. Catching it here
    surfaces the *actual* storage error message in the response (so it's
    finally possible to tell "bucket doesn't exist" apart from "network
    timeout" apart from anything else) and logs it server-side too.
    """
    try:
        return upload_file(bucket, path, data, content_type)
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception(
            "Storage upload failed (bucket=%s, path=%s): %s", bucket, path, e
        )
        raise HTTPException(502, f"Upload failed — storage error: {e}")


@router.post("/profile-photo", response_model=MediaUploadResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Only JPEG/PNG/WebP images allowed")
    data = await file.read()
    max_image_mb = int(await get_config(db, "max_image_upload_mb", 10))
    if len(data) > max_image_mb * 1024 * 1024:
        raise HTTPException(400, f"Image must be under {max_image_mb}MB")

    path = profile_photo_path(str(user.id))
    url = _safe_upload(BUCKET_PROFILE, path, data, file.content_type)
    user.avatar_url = url
    await db.commit()
    return MediaUploadResponse(url=url, path=path, bucket=BUCKET_PROFILE)


@router.post("/worker-post", response_model=MediaUploadResponse)
async def upload_worker_post(
    file: UploadFile = File(...),
    service_id: Optional[str] = Form(None),
    caption: Optional[str] = Form(None),
    is_featured: bool = Form(False),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    is_video = file.content_type in ALLOWED_VIDEO_TYPES
    is_image = file.content_type in ALLOWED_IMAGE_TYPES
    if not is_video and not is_image:
        raise HTTPException(400, "Only images or videos allowed")

    data = await file.read()
    max_image_mb = int(await get_config(db, "max_image_upload_mb", 10))
    max_video_mb = int(await get_config(db, "max_video_upload_mb", 100))
    max_size = (max_video_mb if is_video else max_image_mb) * 1024 * 1024
    if len(data) > max_size:
        raise HTTPException(400, f"File too large (max {max_video_mb if is_video else max_image_mb}MB)")

    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    path = worker_post_path(str(user.id), file.filename or "upload")
    url = _safe_upload(BUCKET_POSTS, path, data, file.content_type)
    media_type = "video" if is_video else "image"

    parsed_service_id = None
    if service_id:
        try:
            parsed_service_id = _uuid.UUID(service_id)
        except ValueError:
            raise HTTPException(400, "Invalid service_id")

    media = ServiceMedia(
        worker_id=wp.id,
        service_id=parsed_service_id,
        type=media_type,
        cloudinary_url=url,
        cloudinary_id=path,
        caption=caption,
        is_featured=is_featured,
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)

    return MediaUploadResponse(
        url=url, path=path, bucket=BUCKET_POSTS,
        media_id=str(media.id), media_type=media_type,
    )


@router.post("/document", response_model=MediaUploadResponse)
async def upload_document_file(
    file: UploadFile = File(...),
    doc_type: str = Form("aadhaar"),
    user: User = Depends(get_current_user),
):
    """Upload a document (ID card, passport, etc.) to Supabase Storage.
    Does NOT require a WorkerProfile — used during onboarding.
    Returns the public URL and path for later registration via POST /workers/documents.
    """
    ALLOWED_DOC_TYPES = {*ALLOWED_IMAGE_TYPES, "application/pdf"}
    if file.content_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(400, "Only JPEG/PNG/WebP/PDF files allowed")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "Document must be under 10MB")

    original = file.filename or "doc"
    path = worker_document_path(str(user.id), doc_type, original)
    url = _safe_upload(BUCKET_DOCUMENTS, path, data, file.content_type)

    return MediaUploadResponse(url=url, path=path, bucket=BUCKET_DOCUMENTS)


@router.post("/verification-video", response_model=MediaUploadResponse)
async def upload_verification_video(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload worker intro/verification video.
    Stored in verification_video_worker bucket.
    Does NOT require an approved WorkerProfile — used during onboarding.
    Registers a worker_documents record with type='verification_video' so admin can review it.
    Max 200MB (longer intro videos).
    """
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(400, "Only MP4/MOV/WebM video files allowed")

    data = await file.read()
    max_verif_video_mb = int(await get_config(db, "max_verification_video_mb", 200))
    if len(data) > max_verif_video_mb * 1024 * 1024:
        raise HTTPException(400, f"Video must be under {max_verif_video_mb}MB")

    path = verification_video_path(str(user.id), file.filename or "intro.mp4")
    url = _safe_upload(BUCKET_VERIFICATION_VIDEO, path, data, file.content_type)

    # Register in worker_documents so admin sees it in verification queue
    from models import WorkerDocument
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if wp:
        # Upsert: remove any previous verification video record first
        existing = await db.execute(
            select(WorkerDocument).where(
                WorkerDocument.worker_id == wp.id,
                WorkerDocument.type == "verification_video",
            )
        )
        old = existing.scalar_one_or_none()
        if old:
            # Delete old video from storage before replacing
            try:
                delete_file(BUCKET_VERIFICATION_VIDEO, old.cloudinary_id)
            except Exception:
                pass
            await db.delete(old)

        doc = WorkerDocument(
            worker_id=wp.id,
            type="verification_video",
            cloudinary_url=url,
            cloudinary_id=path,
        )
        db.add(doc)
        await db.commit()

    return MediaUploadResponse(url=url, path=path, bucket=BUCKET_VERIFICATION_VIDEO)


@router.delete("/worker-post/{media_id}", response_model=SuccessResponse)
async def delete_worker_post(
    media_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404)

    try:
        parsed_media_id = _uuid.UUID(media_id)
    except ValueError:
        raise HTTPException(400, "Invalid media_id")

    media_result = await db.execute(
        select(ServiceMedia).where(
            ServiceMedia.id == parsed_media_id,
            ServiceMedia.worker_id == wp.id,
        )
    )
    media = media_result.scalar_one_or_none()
    if not media:
        raise HTTPException(404, "Media not found")

    delete_file(BUCKET_POSTS, media.cloudinary_id)
    await db.delete(media)
    await db.commit()
    return SuccessResponse(message="Deleted")
