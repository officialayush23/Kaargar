"""Human overrides + delta sync for UI translations.

Revision ID: 20260826_tx_override
Revises: 20260825_prefs_ui
Create Date: 2026-08-26

WHAT AND WHY
------------
UI strings are machine-translated by Sarvam and cached permanently in
`content_translations`. That covers 99% of copy at near-zero marginal cost, and
it stays. What it cannot do is be WRONG-but-fixable: when Sarvam renders
"Book Worker" as a literal, awkward "बुक कर्मचारी", today the only remedy is to
change the English source and ship a new build.

So this adds an override rather than replacing the pipeline:

    manual_text present ? serve it : serve the machine translation

99% automatic, with an escape hatch for the 1% that reads badly. No
regeneration, no cache invalidation, and the automatic path is untouched.

THE COLUMN THAT MAKES IT POSSIBLE AT ALL: source_text
-----------------------------------------------------
UI rows key on `entity_id = uuid5(UI_NAMESPACE, english_text)` and store only
the TRANSLATION. The English source was never persisted, and uuid5 is one-way —
so given a row there was no way to recover what it was a translation OF.

That blocks both features outright:
  - an admin editing screen must show "Book Worker" -> "बुक कर्मचारी"; without
    the source it can only show an opaque uuid and some Hindi;
  - delta sync has to return {english_source: translated} to merge into the
    client dictionary, which is keyed by English.

`source_text` is nullable because existing rows genuinely cannot be
backfilled — nothing anywhere records the English for them. Instead
`routers/translate.py` fills it opportunistically: every `/ui` request arrives
WITH the source strings, so a cache hit whose source_text is null gets it
written on the spot. The gap closes itself as the app is used, with no
migration that could get it wrong.

DELTA SYNC WITHOUT A VERSION TABLE
----------------------------------
A separate `translation_versions` table would need a bump on every write, which
is a second thing to keep correct and a new way to drift. `max(updated_at)` per
language is already exactly that number, cannot disagree with the rows it
describes, and gives `WHERE updated_at > :since` for free. The index below is
what makes both queries cheap.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260826_tx_override"
down_revision = "20260825_prefs_ui"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("content_translations", sa.Column("source_text", sa.Text(), nullable=True))
    op.add_column("content_translations", sa.Column("manual_text", sa.Text(), nullable=True))
    op.add_column(
        "content_translations",
        sa.Column("manual_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "content_translations",
        sa.Column("manual_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Serves both endpoints: `max(updated_at)` for the version probe and
    # `updated_at > :since` for the delta. Partial on entity_type='ui' because
    # service/package/offer translations are fetched by entity id and would
    # only bloat this index.
    op.create_index(
        "ix_content_translations_ui_sync",
        "content_translations",
        ["language", "updated_at"],
        postgresql_where=sa.text("entity_type = 'ui'"),
    )


def downgrade() -> None:
    op.drop_index("ix_content_translations_ui_sync", table_name="content_translations")
    op.drop_column("content_translations", "manual_at")
    op.drop_column("content_translations", "manual_by")
    op.drop_column("content_translations", "manual_text")
    op.drop_column("content_translations", "source_text")
