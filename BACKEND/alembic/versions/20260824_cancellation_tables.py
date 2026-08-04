"""Instant pre-assignment cancellations + worker penalty dues ledger.

Revision ID: 20260824_cancel_tables
Revises: 20260823_support_chat
Create Date: 2026-08-24

TWO TABLES, TWO DIFFERENT JOBS
------------------------------

1. `instant_cancellations`
   A customer cancelling an Instant job **before a worker was assigned**. This
   costs nobody anything, so it carries NO penalty — it's captured purely so we
   can see *why* people abandon instant bookings. That's a product signal
   (wrong price? too slow? wrong service?) and right now it's thrown away
   entirely: `cancel_job` accepts a free-text reason and only stores it on the
   refund record, where nobody will ever aggregate it.

   Reasons are a fixed enum + free text, Rapido-style, so the data is
   groupable. A pure free-text column produces a thousand unique strings and
   answers nothing.

2. `penalty_dues`
   A worker cancelling a job they had ALREADY ACCEPTED. First two are forgiven
   (and the worker is told how many remain); after that the penalty is the
   **whole base fare of that job**, carried forward and settled out of their
   next payout.

   WHY IT'S KEYED ON PHONE **AND** EMAIL, not just worker_id:
   a debt attached only to a worker_id disappears the moment someone deletes
   their profile and signs up again. Storing the phone and email the debt was
   incurred under means it can be re-attached to a new account for the same
   person. That's the entire point of Ayush's "applied to number + email".
   `worker_id` is still stored for the common case and for joins; the contact
   fields are the durable identity.

   Deliberately a LEDGER (one row per debt, with a settled_at) rather than a
   running balance column on worker_profiles. A balance tells you what is owed;
   a ledger tells you *why*, which is what you need when a worker disputes it —
   and disputes on money are guaranteed.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260824_cancel_tables"
down_revision = "20260823_support_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Instant cancellations (pre-assignment, no penalty) ─────────────
    op.create_table(
        "instant_cancellations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        # Fixed vocabulary so this is groupable. 'other' pairs with reason_text.
        sa.Column("reason_code", sa.String(40), nullable=False),
        sa.Column("reason_text", sa.Text()),
        # Snapshotted so the signal survives the job being edited or deleted.
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id")),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("services.id")),
        sa.Column("quoted_price", sa.Numeric(10, 2)),
        # How long they waited before giving up — the single most useful number
        # here. A wave of cancels at 30s means dispatch is too slow, not that
        # the price is wrong.
        sa.Column("seconds_searching", sa.Integer()),
        sa.Column("workers_notified", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_instant_cancellations_user", "instant_cancellations", ["user_id"])
    op.create_index("ix_instant_cancellations_reason", "instant_cancellations", ["reason_code"])
    op.create_index("ix_instant_cancellations_created", "instant_cancellations", ["created_at"])

    # ── 2. Penalty dues ledger ────────────────────────────────────────────
    op.create_table(
        "penalty_dues",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        # Nullable ON DELETE SET NULL: if the worker profile is deleted the DEBT
        # must survive — that's the whole reason for the contact columns below.
        sa.Column("worker_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("worker_profiles.id", ondelete="SET NULL")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL")),

        # Durable identity — normalised at write time so lookups match.
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),

        sa.Column("job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="SET NULL")),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        # 'pending' -> 'settled' | 'waived'
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        # Which job's payout actually cleared it.
        sa.Column("settled_against_job_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("jobs.id", ondelete="SET NULL")),
        sa.Column("settled_at", sa.DateTime(timezone=True)),
        sa.Column("waived_by", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("waived_reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_penalty_dues_worker", "penalty_dues", ["worker_id"])
    op.create_index("ix_penalty_dues_status", "penalty_dues", ["status"])
    # The lookup that actually matters: "what does this person owe", by contact
    # rather than by account. Partial index — settled rows are never queried
    # this way and would just bloat it.
    op.create_index(
        "ix_penalty_dues_contact_pending",
        "penalty_dues",
        ["phone", "email"],
        postgresql_where=sa.text("status = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index("ix_penalty_dues_contact_pending", table_name="penalty_dues")
    op.drop_index("ix_penalty_dues_status", table_name="penalty_dues")
    op.drop_index("ix_penalty_dues_worker", table_name="penalty_dues")
    op.drop_table("penalty_dues")

    op.drop_index("ix_instant_cancellations_created", table_name="instant_cancellations")
    op.drop_index("ix_instant_cancellations_reason", table_name="instant_cancellations")
    op.drop_index("ix_instant_cancellations_user", table_name="instant_cancellations")
    op.drop_table("instant_cancellations")
