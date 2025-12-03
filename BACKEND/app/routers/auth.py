from fastapi import APIRouter, Depends
import asyncpg
from uuid import UUID
from app.dependencies import get_db, require_user, require_db_user
from app.models import ProfileUpdate, WorkerProfileUpdate, LocationUpdate

router = APIRouter(tags=["Auth & Profile"])

@router.post("/api/auth/upsert_user")
async def upsert_user(
    user_token: dict = Depends(require_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = UUID(user_token["sub"])
    email = user_token.get("email")
    await conn.execute(
        "INSERT INTO public.users (id, email, role) VALUES ($1, $2, 'customer') ON CONFLICT (id) DO NOTHING",
        uid, email
    )
    await conn.execute("INSERT INTO public.wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", uid)
    return {"ok": True, "data": {"id": str(uid), "email": email}}

@router.get("/api/me")
async def get_me(user: dict = Depends(require_db_user), conn: asyncpg.Connection = Depends(get_db)):
    uid = user["id"]
    worker = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", uid)
    gov = await conn.fetchrow("SELECT * FROM public.governance_stats WHERE user_id = $1", uid)
    wallet = await conn.fetchrow("SELECT * FROM public.wallets WHERE user_id = $1", uid)
    kyc_docs = await conn.fetch("SELECT id, doc_type, doc_subtype, storage_path, status, uploaded_at FROM public.kyc_documents WHERE user_id = $1 ORDER BY uploaded_at DESC", uid)

    return {
        "ok": True,
        "data": {
            "user": user,
            "worker_profile": dict(worker) if worker else None,
            "governance": dict(gov) if gov else None,
            "wallet": dict(wallet) if wallet else None,
            "kyc_documents": [dict(r) for r in kyc_docs],
        },
    }

@router.patch("/api/me/profile")
async def update_profile(
    payload: ProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    fields = payload.dict(exclude_unset=True)
    if not fields: return {"ok": True}
    
    cols, vals = [], []
    for i, (k, v) in enumerate(fields.items(), start=1):
        cols.append(f"{k} = ${i}")
        vals.append(v)
    vals.append(uid)
    
    query = f"UPDATE public.users SET {', '.join(cols)} WHERE id = ${len(vals)} RETURNING *"
    row = await conn.fetchrow(query, *vals)
    return {"ok": True, "data": dict(row)}

@router.patch("/api/me/worker")
async def upsert_worker_profile(
    payload: WorkerProfileUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    uid = user["id"]
    if user["role"] != "worker":
        await conn.execute("UPDATE public.users SET role = 'worker' WHERE id = $1", uid)

    fields = payload.dict(exclude_unset=True)
    if not fields:
        await conn.execute("INSERT INTO public.worker_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", uid)
        row = await conn.fetchrow("SELECT * FROM public.worker_profiles WHERE user_id = $1", uid)
        return {"ok": True, "data": dict(row)}

    cols, params, vals, sets = ["user_id"], ["$1"], [uid], []
    for i, (k, v) in enumerate(fields.items(), start=2):
        cols.append(k)
        params.append(f"${i}")
        vals.append(v)
        sets.append(f"{k} = EXCLUDED.{k}")

    query = f"""
    INSERT INTO public.worker_profiles ({', '.join(cols)}) VALUES ({', '.join(params)})
    ON CONFLICT (user_id) DO UPDATE SET {', '.join(sets)} RETURNING *;
    """
    row = await conn.fetchrow(query, *vals)
    return {"ok": True, "data": dict(row)}

@router.patch("/api/me/location")
async def update_location(
    payload: LocationUpdate,
    user: dict = Depends(require_db_user),
    conn: asyncpg.Connection = Depends(get_db),
):
    await conn.execute(
        """
        INSERT INTO public.user_locations (user_id, location)
        VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3)::geography, 4326))
        ON CONFLICT (user_id) DO UPDATE SET location = EXCLUDED.location, last_updated_at = now()
        """,
        user["id"], payload.lon, payload.lat
    )
    return {"ok": True}