

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
               (SELECT content FROM public.messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
        FROM public.chats c JOIN public.jobs j ON j.id = c.job_id
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
    job = await conn.fetchrow("SELECT j.customer_id, j.worker_id FROM public.chats c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = $1", chat_id)
    if not job or user["id"] not in (job["customer_id"], job["worker_id"]): raise HTTPException(403, "Access denied")
    
    row = await conn.fetchrow("INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *", chat_id, user["id"], payload.content)
    
    msg_data = {
        "id": str(row["id"]), "chat_id": str(chat_id), "sender_id": str(user["id"]),
        "content": row["content"], "created_at": row["created_at"].isoformat()
    }
    
    if r: await r.publish(f"chat:{chat_id}", json.dumps(msg_data))
    return {"ok": True, "data": msg_data}

@router.websocket("/ws/chat/{chat_id}")
async def websocket_chat(websocket: WebSocket, chat_id: str = Path(...)):
    await websocket.accept()
    token = websocket.headers.get("authorization", "").replace("Bearer ", "")
    if not token: await websocket.close(); return

    try:
        payload = verify_and_decode_jwt(token)
        user_id = UUID(payload["sub"])
    except: await websocket.close(); return

    # DB Check
    pool = websocket.app.state.db_pool
    async with pool.acquire() as conn:
        job = await conn.fetchrow("SELECT j.customer_id, j.worker_id FROM public.chats c JOIN public.jobs j ON j.id = c.job_id WHERE c.id = $1", UUID(chat_id))
        if not job or user_id not in (job["customer_id"], job["worker_id"]): await websocket.close(); return

    r = getattr(websocket.app.state, "redis", None)
    channel = f"chat:{chat_id}"
    
    if r:
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        async def reader():
            try:
                async for msg in pubsub.listen():
                    if msg["type"] == "message": await websocket.send_text(msg["data"])
            except: pass
        asyncio.create_task(reader())

    try:
        while True:
            data = await websocket.receive_text()
            async with pool.acquire() as conn:
                row = await conn.fetchrow("INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *", UUID(chat_id), user_id, data)
            
            msg_out = json.dumps({
                "id": str(row["id"]), "chat_id": chat_id, "sender_id": str(user_id),
                "content": row["content"], "created_at": row["created_at"].isoformat()
            })
            if r: await r.publish(channel, msg_out)
            else: await websocket.send_text(msg_out)
    except WebSocketDisconnect: pass

