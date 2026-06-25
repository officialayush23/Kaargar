"""
Upload router — Supabase Storage.
POST /upload/profile-photo  → profile_photos bucket
POST /upload/worker-post    → worker_posts bucket
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

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_VIDEO_SIZE = 100 * 1024 * 1024


@router.post("/profile-photo", response_model=MediaUploadResponse)
async def upload_profile_photo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(400, "Only JPEG/PNG/WebP images allowed")
    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(400, "Image must be under 10MB")

    path = profile_photo_path(str(user.id))
    url = upload_file(BUCKET_PROFILE, path, data, file.content_type)
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
    max_size = MAX_VIDEO_SIZE if is_video else MAX_IMAGE_SIZE
    if len(data) > max_size:
        raise HTTPException(400, f"File too large")

    wp_result = await db.execute(select(WorkerProfile).where(WorkerProfile.user_id == user.id))
    wp = wp_result.scalar_one_or_none()
    if not wp:
        raise HTTPException(404, "Worker profile not found")

    path = worker_post_path(str(user.id), file.filename or "upload")
    url = upload_file(BUCKET_POSTS, path, data, file.content_type)
    media_type = "video" if is_video else "image"

    media = ServiceMedia(
        worker_id=wp.id,
        service_id=_uuid.UUID(service_id) if service_id else None,
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
    url = upload_file(BUCKET_DOCUMENTS, path, data, file.content_type)

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
    MAX_VERIF_VIDEO = 200 * 1024 * 1024
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(400, "Only MP4/MOV/WebM video files allowed")

    data = await file.read()
    if len(data) > MAX_VERIF_VIDEO:
        raise HTTPException(400, "Video must be under 200MB")

    path = verification_video_path(str(user.id), file.filename or "intro.mp4")
    url = upload_file(BUCKET_VERIFICATION_VIDEO, path, data, file.content_type)

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

    media_result = await db.execute(
        select(ServiceMedia).where(
            ServiceMedia.id == _uuid.UUID(media_id),
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
