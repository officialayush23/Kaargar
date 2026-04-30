"""
Supabase Storage helper.
Buckets: profile_photos, worker_posts, documents
"""

from supabase import create_client
from config import get_settings
import uuid, time

settings = get_settings()
supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

BUCKET_PROFILE = "profile_photos"
BUCKET_POSTS = "worker_posts"
BUCKET_DOCUMENTS = "documents"


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
