"""
Supabase Storage helper.
Buckets: profile_photos, worker_post, documents, verification_video_worker,
job_before_after, job_item_photos, instant-services

Bucket visibility (verified live against storage.buckets, then fixed —
previously ALL seven were public=true, which for `documents` and
`verification_video_worker` bypassed those buckets' own owner/admin-only RLS
SELECT policies on storage.objects: anyone with a path — no auth at all —
could fetch a worker's identity documents or verification video via the
`/object/public/...` URL, which skips RLS by design for public buckets.
profile_photos / worker_post / job_before_after / job_item_photos /
instant_services are intentionally public (customer-facing content, RLS
already allows open SELECT on those) and were left as-is.
`documents` and `verification_video_worker` are now public=false — this
module hands out short-lived SIGNED urls for them instead (get_signed_url /
_PRIVATE_BUCKETS below), generated fresh on every read, never stored
long-term.
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
# Icon/photo assets for admin-curated Instant-mode catalog services
# (ServiceCatalog.icon_url) — public-read, admin-only write (enforced at the
# API layer via require_admin on the upload endpoint; the bucket itself is
# public since these icons are shown to every customer browsing Instant).
# Bucket already exists in Supabase as "instant_services" (underscore, not
# hyphen — matches this project's other bucket names like job_before_after).
BUCKET_INSTANT_SERVICES = "instant_services"

# Buckets holding KYC-grade PII (government ID docs, face-verification
# video) — private in Supabase, signed URLs only. Every other bucket in this
# file is public-read by design (profile pics, portfolio/job photos, catalog
# icons — all meant to be viewable without auth).
_PRIVATE_BUCKETS = {BUCKET_DOCUMENTS, BUCKET_VERIFICATION_VIDEO}

# How long a signed URL for a private bucket stays valid. Long enough to
# load in the admin verification-review UI in one sitting; short enough
# that a URL leaked via logs/screenshots/browser history stops working soon.
SIGNED_URL_TTL_SECONDS = 600


def get_public_url(bucket: str, path: str) -> str:
    return f"{settings.supabase_url}/storage/v1/object/public/{bucket}/{path}"


def get_signed_url(bucket: str, path: str, expires_in: int = SIGNED_URL_TTL_SECONDS) -> str:
    """
    Time-limited URL for a private bucket (documents, verification_video_worker).
    Always call this fresh at read time — do not persist the result, it
    expires. supabase-py's response key has varied across versions
    (signedURL / signedUrl / signed_url) and the value is a path, not a full
    URL, hence the manual prefixing below.
    """
    result = supabase.storage.from_(bucket).create_signed_url(path, expires_in)
    signed = result.get("signedURL") or result.get("signedUrl") or result.get("signed_url") or ""
    if not signed:
        return ""
    if signed.startswith("http"):
        return signed
    return f"{settings.supabase_url}/storage/v1{signed}"


def upload_file(bucket: str, path: str, file_bytes: bytes, content_type: str) -> str:
    supabase.storage.from_(bucket).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    if bucket in _PRIVATE_BUCKETS:
        return get_signed_url(bucket, path)
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
