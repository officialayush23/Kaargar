"""Move UI preferences (language, active mode) into user_preferences.

Revision ID: 20260825_prefs_ui
Revises: 20260825_sections
Create Date: 2026-08-25

WHY
---
`language` and `activeMode` were held in device-level MMKV on the client and
read at module init. That is the wrong home for them, and it produced three
separate reported bugs:

  - a language chosen by one account appeared for the next account to sign in
    on that phone;
  - a plain customer landed in worker mode inherited from a previous account;
  - and because `useT` gates translation on `activeMode === 'worker'`, that
    second bug dragged the previous worker's translated UI onto a customer's
    screens.

All three are the same mistake: per-USER state kept per DEVICE. It was patched
client-side by clearing on logout, but that relies on every future sign-out
path remembering to call the reset — the pattern had already produced four
bugs by the time it was noticed.

Storing them against the user removes the class of bug rather than the
instances: the value arrives with the account, so it cannot outlive it, and it
follows the user to a second device for free.

WHY user_preferences AND NOT users
----------------------------------
`user_preferences` already exists for exactly this (top_categories,
preferred_mode, home location), is 1:1 with users, and is `ON DELETE CASCADE`.
Adding UI preferences to `users` would mix identity with settings and widen a
row that is read on every single authenticated request.

NOTE ON `preferred_mode`
------------------------
This table already has a `preferred_mode` column, which is NOT the same thing
and must not be reused: that one is 'instant' vs 'discovery' (how the customer
likes to book). The new column is 'customer' vs 'worker' (which side of the app
you are currently using). Similar names, unrelated meanings — hence
`active_mode`, spelled differently on purpose.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260825_prefs_ui"
down_revision = "20260825_sections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default so existing rows get a sane value without a backfill pass,
    # and so a row created by any code path that doesn't know about these
    # columns is still valid.
    op.add_column(
        "user_preferences",
        sa.Column("language", sa.String(5), server_default="en", nullable=False),
    )
    op.add_column(
        "user_preferences",
        sa.Column("active_mode", sa.String(16), server_default="customer", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "active_mode")
    op.drop_column("user_preferences", "language")
