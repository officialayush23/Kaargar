from fastapi import APIRouter, Depends
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

@router.get("/api/me/stats")
async def get_user_stats(
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db)
):
    """
    Returns summary stats for profile view: 
    - total_earned_cents
    - total_spent_cents
    - jobs_completed_count (as worker)
    """
    # 1. Total Earned (Positive transactions of type 'job_payment')
    total_earned = await conn.fetchval(
        """
        SELECT COALESCE(SUM(amount_cents), 0)
        FROM public.wallet_transactions
        WHERE user_id = $1 AND type = 'job_payment' AND amount_cents > 0
        """,
        user["id"]
    )

    # 2. Total Spent (Negative transactions, e.g. payments)
    # Note: Escrow lock is negative, but release logic might complicate. 
    # Usually "spent" means payments successfully made (released). 
    # For now, let's sum all negative job_payment transactions (money left wallet).
    total_spent = await conn.fetchval(
        """
        SELECT COALESCE(ABS(SUM(amount_cents)), 0)
        FROM public.wallet_transactions
        WHERE user_id = $1 AND type = 'job_payment' AND amount_cents < 0
        """,
        user["id"]
    )

    # 3. Jobs Completed as Worker
    jobs_count = await conn.fetchval(
        "SELECT COUNT(*) FROM public.jobs WHERE worker_id = $1 AND status = 'completed'",
        user["id"]
    )

    return {
        "ok": True,
        "data": {
            "total_earned_cents": total_earned,
            "total_spent_cents": total_spent,
            "jobs_completed_count": jobs_count
        }
    }