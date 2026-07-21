"""
Supabase Storage helper.
Buckets: profile_photos, worker_post, documents, verification_video_worker
"""

from supabase import create_client
from config import get_settings
import uuid, time

settings = get_settings()
supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

BUCKET_PROFILE = "profile_photos"
BUCKET_POSTS = "worker_post"
BUCKET_DOCUMENTS = "documents"
BUCKET_VERIFICATION_VIDEO = "verification_video_worker"
BUCKET_JOB_BEFORE_AFTER = "job_before_after"
BUCKET_JOB_ITEM_PHOTOS = "job_item_photos"


def get_public_url(bucket: str, path: str) -> str:
    return f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"


def upload_file(bucket: str, path: str, file_bytes: bytes, content_type: str) -> str:
    supabase.storage.from_(bucket).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return get_public_url(bucket, path)


def delete_file(bucket: str, path: str) -> None:
    supabase.storage.from_(bucket).remove([path])


def profile_photo_path(user_id: str, filename: str = "avatar.jpg") -> str:
    return f"{user_id}/{filename}"


def worker_post_path(user_id: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    return f"{user_id}/{int(time.time())}_{uuid.uuid4().hex[:8]}.{ext}"


def worker_document_path(user_id: str, doc_type: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    return f"{user_id}/doc_{doc_type}_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"


def verification_video_path(user_id: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "mp4"
    return f"{user_id}/intro_{int(time.time())}_{uuid.uuid4().hex[:6]}.{ext}"


def job_before_after_path(user_id: str, job_id: str, phase: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    return f"{user_id}/{job_id}/{phase}_{int(time.time())}_{uuid.uuid4().hex[:8]}.{ext}"


def job_item_photo_path(user_id: str, job_id: str, kind: str, original_filename: str) -> str:
    ext = original_filename.rsplit(".", 1)[-1].lower() if "." in original_filename else "jpg"
    return f"{user_id}/{job_id}/{kind}_{int(time.time())}_{uuid.uuid4().hex[:8]}.{ext}"


def delete_worker_verification_files(user_id: str, doc_paths: list, video_path) -> None:
    """Delete all identity docs and verification video after admin decision (approve/reject)."""
    if doc_paths:
        try:
            supabase.storage.from_(BUCKET_DOCUMENTS).remove(doc_paths)
        except Exception:
            pass  # best-effort; don't fail the approve/reject on storage error
    if video_path:
        try:
            supabase.storage.from_(BUCKET_VERIFICATION_VIDEO).remove([video_path])
        except Exception:
            pass
