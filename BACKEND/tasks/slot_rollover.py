"""
APScheduler task — rolling slot-window generation.

Runs ~once a day. For every active, slot-mode service that has slot
configuration (ServiceSlotConfig.auto_generate == True), (re)generates
ServiceSlots so the booking window always extends ~14 days into the future.

Does NOT reimplement slot generation — calls into the same core logic used
by the manual POST /workers/me/services/{service_id}/slots/generate endpoint
(routers/workers.py::_generate_slots_core), which is idempotent (skips
days/slots already seeded).
"""

import asyncio
from datetime import date, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler

# How many days ahead the generated-slots window should always reach.
ROLLING_WINDOW_DAYS = 14


def start_slot_rollover_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        roll_forward_slot_windows,
        "interval",
        hours=24,
        id="slot_rollover",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    return scheduler


async def roll_forward_slot_windows():
    """
    For every active slot-mode service with slot config, ensure slots exist
    from today through today + ROLLING_WINDOW_DAYS.
    """
    from database import async_session
    from sqlalchemy import select
    from models import Service, ServiceSlotConfig
    from routers.workers import _generate_slots_core

    try:
        async with async_session() as db:
            result = await db.execute(
                select(Service, ServiceSlotConfig)
                .join(ServiceSlotConfig, ServiceSlotConfig.service_id == Service.id)
                .where(
                    Service.is_active == True,          # noqa: E712
                    Service.requires_slot == True,       # noqa: E712
                    ServiceSlotConfig.auto_generate == True,  # noqa: E712
                )
            )
            rows = result.all()

            today = date.today()
            until = today + timedelta(days=ROLLING_WINDOW_DAYS)

            total_created = 0
            for svc, cfg in rows:
                try:
                    created = await _generate_slots_core(
                        db, svc.worker_id, svc.id, cfg, today, until
                    )
                    total_created += len(created)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    print(f"[SLOT_ROLLOVER] Failed for service {svc.id}: {exc}")

            if rows:
                print(
                    f"[SLOT_ROLLOVER] Rolled {len(rows)} slot-mode service(s) forward "
                    f"to {until.isoformat()} ({total_created} new slot(s))"
                )
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        print(f"[SLOT_ROLLOVER] Skipped run due to DB error: {exc}")
