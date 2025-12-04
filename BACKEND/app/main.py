import os
import logging
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import redis.asyncio as redis
from dotenv import load_dotenv
from uuid import UUID

# Import all routers (Added complaints.router)
from app.routers import auth, jobs, search, chat, wallet, admin, uploads, ratings, kyc, complaints
from app.auth import verify_and_decode_jwt

load_dotenv()

# --- Config ---
logger = logging.getLogger("kaargar")
logging.basicConfig(level=logging.INFO)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL: raise RuntimeError("DATABASE_URL not set")
REDIS_URL = os.getenv("REDIS_URL")

app = FastAPI(title="KAARGAR API v5")

# --- CORS ---
raw_origins = os.getenv("CORS_ORIGINS", "")
origins = [o.strip() for o in raw_origins.split(",")] if raw_origins else [
    "http://localhost:5173", 
    "https://kaargar.vercel.app",
    "https://kaargar.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Lifecycle ---
@app.on_event("startup")
async def startup():
    logger.info("Starting up...")
    try:
        app.state.db_pool = await asyncpg.create_pool(
            DATABASE_URL, 
            min_size=2, 
            max_size=20, 
            command_timeout=60, 
            statement_cache_size=0 
        )
        logger.info("Database Connected")
    except Exception as e:
        logger.error(f"Database Connection Failed: {e}")
        raise e

    if REDIS_URL:
        try:
            app.state.redis = redis.from_url(REDIS_URL, decode_responses=True)
            await app.state.redis.ping()
            logger.info("Redis Connected")
        except Exception as e:
            logger.error(f"Redis Connection Failed: {e}")
            app.state.redis = None
    else:
        app.state.redis = None

@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down")
    if getattr(app.state, "db_pool", None): await app.state.db_pool.close()
    if getattr(app.state, "redis", None): await app.state.redis.close()

# --- Include Routers ---
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(search.router)
app.include_router(chat.router)
app.include_router(wallet.router)
app.include_router(admin.router)
app.include_router(uploads.router)
app.include_router(ratings.router)
app.include_router(kyc.router)
app.include_router(complaints.router) # Registered here

# --- Health Check ---
@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy"}

# --- WebSocket ---
@app.websocket("/ws/notifications")
async def ws_notifications(websocket: WebSocket):
    await websocket.accept()
    token = websocket.query_params.get("token")
    if not token: await websocket.close(code=status.WS_1008_POLICY_VIOLATION); return
    
    try:
        payload = verify_and_decode_jwt(token)
        user_id = payload["sub"]
    except: await websocket.close(code=status.WS_1008_POLICY_VIOLATION); return

    r = getattr(app.state, "redis", None)
    if not r: await websocket.close(reason="Realtime unavailable"); return

    pubsub = r.pubsub()
    try:
        await pubsub.subscribe(f"notifications:{user_id}")
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg: await websocket.send_text(msg["data"])
            await asyncio.sleep(0.1)
    except WebSocketDisconnect: pass
    finally: await pubsub.close()