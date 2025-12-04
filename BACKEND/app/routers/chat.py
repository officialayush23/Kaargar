import json
import asyncio
from uuid import UUID
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException, Path
import asyncpg
import redis.asyncio as redis
from typing import Optional
from app.dependencies import get_db, require_db_user, get_redis
from app.auth import verify_and_decode_jwt
from app.models import MessageCreate

router = APIRouter(tags=["Chat"])

# --- Notification Helper ---
async def notify_recipient(r: redis.Redis, recipient_id: UUID, sender_name: str, message_preview: str, job_title: str, job_id: str):
    """Send global notification to the recipient"""
    if r and recipient_id:
        try:
            payload = {
                "type": "new_message",
                "title": f"Message from {sender_name}",
                "message": message_preview[:50] + "..." if len(message_preview) > 50 else message_preview,
                "job_title": job_title,
                "job_id": job_id
            }
            await r.publish(f"notifications:{recipient_id}", json.dumps(payload))
        except Exception as e:
            print(f"Failed to notify recipient: {e}")

@router.post("/api/jobs/{job_id}/chat")
async def get_or_create_chat(job_id: UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    job = await conn.fetchrow("SELECT customer_id, worker_id FROM public.jobs WHERE id = $1", job_id)
    if not job or user["id"] not in (job["customer_id"], job["worker_id"]): raise HTTPException(403, "Access denied")
    
    chat = await conn.fetchrow("SELECT * FROM public.chats WHERE job_id = $1", job_id)
    if not chat:
        chat = await conn.fetchrow("INSERT INTO public.chats (job_id) VALUES ($1) RETURNING *", job_id)
    return {"ok": True, "data": dict(chat)}

@router.get("/api/chats")
async def list_chats(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    rows = await conn.fetch(
        """
        SELECT c.id AS chat_id, j.id AS job_id, j.title, j.customer_id, j.worker_id, j.status,
               (SELECT content FROM public.messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
               CASE WHEN j.customer_id = $1 THEN u_worker.full_name ELSE u_customer.full_name END as other_name,
               CASE WHEN j.customer_id = $1 THEN u_worker.avatar_url ELSE u_customer.avatar_url END as other_avatar
        FROM public.chats c 
        JOIN public.jobs j ON j.id = c.job_id
        LEFT JOIN public.users u_customer ON u_customer.id = j.customer_id
        LEFT JOIN public.users u_worker ON u_worker.id = j.worker_id
        WHERE j.customer_id = $1 OR j.worker_id = $1
        ORDER BY j.created_at DESC
        """, user["id"]
    )
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.get("/api/chats/{chat_id}/messages")
async def get_messages(chat_id: UUID, user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    job = await conn.fetchrow("SELECT j.customer_id, j.worker_id FROM public.chats c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = $1", chat_id)
    if not job or user["id"] not in (job["customer_id"], job["worker_id"]): raise HTTPException(403, "Access denied")
    rows = await conn.fetch("SELECT * FROM public.messages WHERE chat_id = $1 ORDER BY created_at ASC", chat_id)
    return {"ok": True, "data": [dict(r) for r in rows]}

@router.post("/api/chats/{chat_id}/messages")
async def send_message_http(
    chat_id: UUID, 
    payload: MessageCreate, 
    user: dict = Depends(require_db_user), 
    conn: asyncpg.Connection = Depends(get_db), 
    r: Optional[redis.Redis] = Depends(get_redis)
):
    # 1. Verify Access & Get Context
    job_context = await conn.fetchrow(
        """
        SELECT j.customer_id, j.worker_id, j.title, j.id as job_id
        FROM public.chats c 
        JOIN public.jobs j ON j.id = c.job_id 
        WHERE c.id = $1
        """, 
        chat_id
    )
    
    if not job_context: raise HTTPException(404, "Chat not found")
    if user["id"] not in (job_context["customer_id"], job_context["worker_id"]): 
        raise HTTPException(403, "Access denied")
    
    # Determine Recipient
    recipient_id = job_context["worker_id"] if user["id"] == job_context["customer_id"] else job_context["customer_id"]

    # 2. Save Message (Handling optional content and media fields)
    row = await conn.fetchrow(
        """
        INSERT INTO public.messages (chat_id, sender_id, content, media_url, media_type) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *
        """, 
        chat_id, user["id"], payload.content, payload.media_url, payload.media_type
    )
    
    # Safe serialization of row data
    msg_data = {
        "id": str(row["id"]), 
        "chat_id": str(chat_id), 
        "sender_id": str(user["id"]),
        "content": row["content"], 
        "media_url": row["media_url"],
        "media_type": row["media_type"],
        "created_at": row["created_at"].isoformat()
    }
    
    if r: 
        # Publish to Chat Room (for active chat window)
        await r.publish(f"chat:{chat_id}", json.dumps(msg_data))
        
        # Publish to Global Notification (for toast)
        preview = "Sent an attachment" if not payload.content else payload.content
        await notify_recipient(r, recipient_id, user["full_name"] or "User", preview, job_context["title"], str(job_context["job_id"]))

    return {"ok": True, "data": msg_data}

@router.websocket("/ws/chat/{chat_id}")
async def websocket_chat(websocket: WebSocket, chat_id: str = Path(...)):
    await websocket.accept()
    
    # 1. Auth
    token = websocket.query_params.get("token")
    if not token: await websocket.close(); return

    try:
        payload = verify_and_decode_jwt(token)
        user_id = UUID(payload["sub"])
        user_name = payload.get("user_metadata", {}).get("full_name", "User")
    except: await websocket.close(); return

    # 2. DB Check & Context
    pool = websocket.app.state.db_pool
    async with pool.acquire() as conn:
        job_context = await conn.fetchrow(
            "SELECT j.customer_id, j.worker_id, j.title, j.id as job_id FROM public.chats c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = $1", 
            UUID(chat_id)
        )
        if not job_context or user_id not in (job_context["customer_id"], job_context["worker_id"]): 
            await websocket.close()
            return
        
        recipient_id = job_context["worker_id"] if user_id == job_context["customer_id"] else job_context["customer_id"]

    r = getattr(websocket.app.state, "redis", None)
    channel = f"chat:{chat_id}"
    
    if r:
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        
        async def reader():
            try:
                async for msg in pubsub.listen():
                    if msg["type"] == "message": await websocket.send_text(msg["data"])
            except asyncio.CancelledError: pass
        
        asyncio.create_task(reader())

    try:
        while True:
            data = await websocket.receive_text()
            
            # Save Message (Text only via WS)
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    "INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *", 
                    UUID(chat_id), user_id, data
                )
            
            msg_out = json.dumps({
                "id": str(row["id"]), "chat_id": chat_id, "sender_id": str(user_id),
                "content": row["content"], "created_at": row["created_at"].isoformat()
            })
            
            if r: 
                await r.publish(channel, msg_out)
                notif_payload = {
                    "type": "new_message",
                    "title": f"Message from {user_name}",
                    "message": row["content"][:50],
                    "job_title": job_context["title"],
                    "job_id": str(job_context["job_id"])
                }
                await r.publish(f"notifications:{recipient_id}", json.dumps(notif_payload))
            else: 
                await websocket.send_text(msg_out)

    except WebSocketDisconnect: pass