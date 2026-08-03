"""Add platform_config key: max_multi_day_booking_days

Makes the maximum length of a multi-day Discovery booking admin-configurable
instead of hardcoded.

BACKGROUND
----------
Before this, the only ceiling on a multi-day booking was
`MultiDayBookingCreate.num_days: Field(..., ge=1, le=90)` — a Pydantic bound
in schemas.py. That meant:

  * the real product limit could not be changed without a code change +
    redeploy, unlike every other tunable in the system (dispatch radii,
    escrow hold hours, slot buffer, commission rates, penalty amounts…),
    all of which already live in platform_config and are editable from the
    admin config page; and
  * the three layers disagreed — backend allowed 90, the web UI's
    MultiDayRangePicker capped at 60, and the intended product rule was 10.

`routers/jobs.py:create_multi_day_booking` now reads this key via
`get_config(db, "max_multi_day_booking_days", 10)` and rejects longer
bookings with a 400. The Pydantic `le=90` stays as a generous sanity
ceiling, so RAISING the limit from the admin page needs no deploy; lowering
it is the normal case.

Data-only migration — no schema change. Idempotent: the insert is skipped if
the key already exists, so it is safe to run against a database where an
admin has already created the row by hand.

Revision ID: 20260809_max_multi_day_config
Revises: baseline_20260803
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260809_max_multi_day_config"
down_revision: Union[str, None] = "baseline_20260803"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONFIG_KEY = "max_multi_day_booking_days"
DEFAULT_VALUE = "10"
DESCRIPTION = (
    "Maximum number of consecutive days a single multi-day Discovery booking "
    "may span. Enforced server-side in POST /jobs/scheduled/multi-day."
)


def upgrade() -> None:
    op.execute(
        f"""
        INSERT INTO platform_config (key, value, description)
        VALUES ('{CONFIG_KEY}', '{DEFAULT_VALUE}', '{DESCRIPTION}')
        ON CONFLICT (key) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM platform_config WHERE key = '{CONFIG_KEY}'")
