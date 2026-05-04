"""
APScheduler task — reset workers from auto-offline after timeout.
"""

import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone


def start_decay_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(restore_auto_offline_workers, "interval", minutes=1, id="decay_scores")
    scheduler.start()
    return scheduler


async def restore_auto_offline_workers():
    from database import async_session
    from models import WorkerProfile
    from sqlalchemy import select

    try:
        async with async_session() as db:
            now = datetime.now(timezone.utc)
            result = await db.execute(
                select(WorkerProfile)
                .where(WorkerProfile.status == "offline")
                .where(WorkerProfile.auto_offline_until != None)
                .where(WorkerProfile.auto_offline_until <= now)
            )
            workers = result.scalars().all()
            for wp in workers:
                wp.status = "online"
                wp.auto_offline_until = None
            if workers:
                await db.commit()
                print(f"[DECAY] Restored {len(workers)} workers from auto-offline")
    except asyncio.CancelledError:
        pass  # server is shutting down / reloading — clean exit, no traceback
    except Exception as exc:
        print(f"[DECAY] Skipped run due to DB error: {exc}")
