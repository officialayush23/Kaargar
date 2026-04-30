"""
APScheduler task — auto-release escrow after 2 hours.
"""

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone


def start_escrow_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(release_due_escrows, "interval", minutes=5, id="escrow_release")
    scheduler.start()
    return scheduler


async def release_due_escrows():
    from database import async_session
    from models import Payment, Payout
    from sqlalchemy import select

    try:
        async with async_session() as db:
            now = datetime.now(timezone.utc)
            result = await db.execute(
                select(Payment)
                .where(Payment.status == "held")
                .where(Payment.escrow_release_due_at <= now)
            )
            payments = result.scalars().all()

            for payment in payments:
                payment.status = "released"
                payment.escrow_released_at = now

                # Create payout record
                from models import Job
                job_result = await db.execute(
                    select(Job).where(Job.id == payment.job_id)
                )
                job = job_result.scalar_one_or_none()
                if job and job.worker_id and job.worker_payout:
                    payout = Payout(
                        worker_id=job.worker_id,
                        payment_id=payment.id,
                        job_id=job.id,
                        gross_amount=job.final_price,
                        platform_fee=job.platform_fee or 0,
                        gst_on_fee=job.gst_on_fee or 0,
                        net_amount=job.worker_payout,
                        status="pending",
                    )
                    db.add(payout)

            await db.commit()
            if payments:
                print(f"[ESCROW] Released {len(payments)} payments")
    except Exception as exc:
        print(f"[ESCROW] Skipped run due to DB error: {exc}")
