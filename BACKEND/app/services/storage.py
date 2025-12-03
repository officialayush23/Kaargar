import os
import uuid
from fastapi import UploadFile, HTTPException
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = None

if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    except Exception as e:
        print(f"Storage Init Error: {e}")

async def upload_file_to_supabase(bucket: str, file: UploadFile, path_prefix: str) -> str:
    """
    Uploads a file to Supabase Storage and returns the public URL.
    """
    if not supabase:
        raise HTTPException(500, "Storage service not configured")
    
    file_content = await file.read()
    file_ext = file.filename.split(".")[-1]
    # Create unique path: prefix/uuid.ext
    file_path = f"{path_prefix}/{uuid.uuid4()}.{file_ext}"
    
    try:
        # upsert=True overwrites if exists (though uuid makes collision unlikely)
        supabase.storage.from_(bucket).upload(
            file_path, 
            file_content, 
            {"content-type": file.content_type, "upsert": "true"}
        )
        return supabase.storage.from_(bucket).get_public_url(file_path)
    except Exception as e:
        print(f"Supabase Upload Failed: {e}")
        raise HTTPException(500, "File upload failed")