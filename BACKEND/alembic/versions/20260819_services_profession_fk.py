"""Enforce at the DB level that a service's category is one the worker registered for

Adds a COMPOSITE foreign key:

    services(worker_id, category_id) -> worker_categories(worker_id, category_id)

WHY THIS IS POSSIBLE HERE (and wasn't for the booking-overlap case)
-------------------------------------------------------------------
`worker_categories` already has `PRIMARY KEY (worker_id, category_id)`, which
is exactly the unique index a composite FK needs to reference. Both
`services.worker_id` and `services.category_id` are NOT NULL, so there is no
"NULL passes the FK" bypass. That makes this a genuine, cheap, always-on
constraint — unlike worker double-booking, where the invariant is a time-range
overlap that no plain constraint can express.

WHY IT'S NEEDED ON TOP OF THE APP CHECKS
----------------------------------------
`create_service` has validated this since it was added, but
`update_service` did NOT — it only validated the catalog link. The guard was
therefore bypassable in one PATCH: create the listing under a profession you
are registered for, then change `category_id` to any other. The
category-fallback dispatch path in `services/matching.py` keys off exactly
this column, so the consequence was a worker being offered instant jobs for a
profession they were never verified for.

Both endpoints are now guarded in application code; this constraint is the
backstop, and covers any future write path (scripts, admin tooling, a migration
someone runs by hand) that forgets the rule.

⚠️ PRE-EXISTING VIOLATIONS WILL BLOCK THIS MIGRATION.
The constraint is added NOT VALID first, so it applies to new/updated rows
immediately and does NOT fail on legacy rows. Validate it separately once the
data is clean:

    -- find offenders
    SELECT s.id, s.title, s.worker_id, s.category_id
    FROM services s
    WHERE NOT EXISTS (
      SELECT 1 FROM worker_categories wc
      WHERE wc.worker_id = s.worker_id AND wc.category_id = s.category_id
    );

    -- then, after fixing or deleting them:
    ALTER TABLE services VALIDATE CONSTRAINT services_worker_category_fk;

At the time of writing there is exactly one violating row ("24hrs Guard",
category CCTV / Security, owned by a worker registered only for Electrician) —
which is the bug that prompted this.

Revision ID: 20260819_services_profession_fk
Revises: 20260809_max_multi_day_config
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260819_services_profession_fk"
down_revision: Union[str, None] = "20260809_max_multi_day_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT = "services_worker_category_fk"


def upgrade() -> None:
    # NOT VALID: enforced for every INSERT/UPDATE from now on, but existing
    # rows are not re-checked, so this cannot fail on legacy data.
    #
    # ON UPDATE CASCADE is deliberately omitted and ON DELETE RESTRICT chosen:
    # if a worker de-registers from a profession we do NOT want their listings
    # silently deleted (that would destroy pricing/media/history). Blocking the
    # de-registration until the listings are dealt with is the safer failure.
    op.execute(
        f"""
        ALTER TABLE services
        ADD CONSTRAINT {CONSTRAINT}
        FOREIGN KEY (worker_id, category_id)
        REFERENCES worker_categories (worker_id, category_id)
        ON DELETE RESTRICT
        NOT VALID
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE services DROP CONSTRAINT IF EXISTS {CONSTRAINT}")
