"""baseline — adopt Alembic on top of an already-live database

Revision ID: baseline_20260803
Revises:
Create Date: 2026-08-03

This is NOT a migration that builds the schema from nothing — it's the
starting point for a database that already has a fully-built schema,
applied outside Alembic (which didn't exist as a wired-up project in this
repo before now, despite being in requirements.txt). upgrade()/downgrade()
are deliberately no-ops. Do not run `alembic upgrade head` against the live
DB expecting it to create anything — the tables already exist. Instead,
stamp the live DB at this revision so Alembic's bookkeeping (the
alembic_version table) matches reality:

    cd BACKEND
    alembic stamp baseline_20260803

`stamp` only writes one row into alembic_version — it does not run
upgrade()/downgrade() and does not touch any other table, so this is safe
to run against production. After stamping, every *new* schema change should
go through `alembic revision --autogenerate -m "..."` (compares models.py
against the live DB) followed by `alembic upgrade head`, instead of hand-run
SQL — that's the whole point of adopting it now.

Where the schema this baseline represents actually came from (for anyone
auditing history later — none of this is duplicated as executable DDL here,
it already exists on the live DB and in these two places):

1. BACKEND's sibling repo root has 001_initial_schema.sql through
   017_worker_areas.sql (18 files — 013 has two: 013_backfill_instant_
   availability.sql and 013_service_catalog.sql), run directly against the
   database before this repo used any migration-tracking tool at all.

2. From `add_icon_url_to_categories` onward, schema changes were applied
   via Supabase's own migration tracking (visible today via the Supabase
   dashboard's Database > Migrations, or the `supabase_migrations.
   schema_migrations` table on the live DB itself) rather than the numbered
   .sql files or Alembic. In chronological order:

     add_icon_url_to_categories
     job_completion_flow
     job_photo_bucket_rls
     multi_day_booking_toggle
     service_multi_day_booking_toggle
     add_rating_penalty_and_no_show_tracking
     multi_day_bundling_and_gst_category
     seed_platform_config_defaults
     service_catalog
     service_catalog_base_price
     seed_instant_catalog
     add_address_details_field
     create_worker_areas
     fix_function_search_path
     add_missing_fk_indexes
     enable_rls_missing_tables_and_policies
     fix_storage_bucket_policies
     revoke_public_execute_handle_new_auth_user
     add_fk_indexes_round2
     fcm_device_tokens_and_notification_columns
     promo_campaigns_and_deliveries
     fix_open_realtime_read_policies
     relocate_trgm_unaccent_extensions
     otp_channel_and_sms_flag

   The last five of these (fcm_device_tokens_and_notification_columns
   through otp_channel_and_sms_flag) added tables/columns that had no
   SQLAlchemy model until the same pass that added this baseline — see
   models.py's DeviceToken, PromoCampaign, PromoCampaignDelivery,
   ContentTranslation, OTPSession.channel, and Notification's push_* /
   fcm_message_id columns. models.py was verified against a live
   information_schema/pg_constraint introspection of the actual database
   at baseline time, not assumed from these migration names alone — an
   `alembic revision --autogenerate` run after stamping this baseline
   should come back empty (or very close to it) if that verification was
   accurate.

3. `messages_safe` and `worker_cards` are VIEWs (not base tables) on the
   live DB with no corresponding model — nothing in the FastAPI backend
   queries either one today, so no model was added for them. Worth
   revisiting if that changes.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "baseline_20260803"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Deliberately empty — see module docstring. Stamp, don't run.
    pass


def downgrade() -> None:
    # Deliberately empty — there is no "before" state this tool knows about.
    pass
