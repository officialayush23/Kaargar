

from fastapi import APIRouter, Depends, Query
import asyncpg
from app.dependencies import get_db, require_db_user

router = APIRouter(tags=["Wallet"])

@router.get("/api/wallet")
async def get_my_wallet(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    row = await conn.fetchrow("SELECT balance_cents, escrow_cents, updated_at FROM public.wallets WHERE user_id = $1", user["id"])
    return {"ok": True, "data": dict(row) if row else {"balance_cents": 0, "escrow_cents": 0}}

@router.get("/api/wallet/transactions")
async def get_wallet_transactions(
    limit: int = 20, offset: int = 0,
    user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)
):
    rows = await conn.fetch("SELECT * FROM public.wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", user["id"], limit, offset)
    return {"ok": True, "data": [dict(r) for r in rows]}
