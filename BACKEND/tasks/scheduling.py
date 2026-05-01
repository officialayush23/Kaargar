"""
APScheduler task — process pending scheduled jobs every 3 minutes.

Calls services/scheduling.py::assign_scheduled_jobs() which:
  1. Finds scheduled jobs whose preferred_days include today.
  2. Checks if it's within ASSIGN_AHEAD_HOURS of window_start.
  3. Finds the best eligible worker in radius.
  4. Assigns, creates a schedule block, and notifies both parties.
  5. On no-worker: removes today from preferred_days and retries next day.
  6. On all days exhausted: marks job as failed, notifies user.
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler


def start_scheduling_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_scheduling_pass,
        "interval",
        minutes=3,
        id="scheduled_job_assignment",
        max_instances=1,       # never run two passes concurrently
        coalesce=True,         # if a run was missed, run once immediately, not multiple
    )
    scheduler.start()
    return scheduler


async def run_scheduling_pass() -> None:
    from database import async_session
    from services.scheduling import assign_scheduled_jobs

    try:
        async with async_session() as db:
            count = await assign_scheduled_jobs(db)
            if count:
                print(f"[SCHEDULER] Assigned {count} scheduled job(s)", flush=True)
    except Exception as exc:
        print(f"[SCHEDULER] Error during scheduling pass: {exc}", flush=True)
