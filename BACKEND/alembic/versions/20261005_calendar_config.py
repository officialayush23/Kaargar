"""Worker calendar: platform_config key for instant-job length

`instant_job_default_minutes` — how long a live instant job is assumed to
occupy a worker's timeline (services/worker_calendar.py). Used to block
customer slots while an instant job runs, and (plus slot_duration_buffer_min)
to stop instant dispatch to a worker whose next booking is too close.

Also adds an index the calendar reads on every request.

Data + index only. Idempotent.

Revision ID: 20261005_calendar_cfg
Revises: 20260826_tx_override
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20261005_calendar_cfg"
down_revision: Union[str, None] = "20260826_tx_override"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO platform_config (key, value, description)
        VALUES ('instant_job_default_minutes', '90',
                'Minutes a live instant job is assumed to occupy the worker. Blocks their calendar and protects upcoming bookings from new instant offers.')
        ON CONFLICT (key) DO NOTHING
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_jobs_worker_status ON jobs (worker_id, status)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_wsb_worker_date ON worker_schedule_blocks (worker_id, date)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_wsb_worker_date")
    op.execute("DROP INDEX IF EXISTS ix_jobs_worker_status")
    op.execute("DELETE FROM platform_config WHERE key = 'instant_job_default_minutes'")
