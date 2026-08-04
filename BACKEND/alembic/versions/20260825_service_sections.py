"""Service sections — cross-profession groupings for Discovery.

Revision ID: 20260825_sections
Revises: 20260824_cancel_tables
Create Date: 2026-08-25

WHAT THIS IS FOR
----------------
Urban-Company-style browsable rows on Discovery: "Fan", "Beauty", "Salon",
"Grooming", "Massage". These are NOT professions and must not be confused with
them:

  Category  = the PROFESSION a worker is verified for (Electrician, Cleaner).
              Drives dispatch, approval and who may offer what. Structural.
  Section    = a CUSTOMER-FACING browsing shelf that cuts ACROSS professions.
              Purely presentational. "Fan" pulls fan installation (Electrician)
              and fan cleaning (Cleaner) onto one row — a customer thinking
              "my fan is broken" does not think in professions.

Conflating the two is the failure mode here: making sections a second kind of
category would put them in the dispatch path, where a purely cosmetic grouping
has no business being. Hence a separate table and a pure many-to-many, with no
FK from anything operational.

MANY-TO-MANY, DELIBERATELY
--------------------------
A single catalog service can legitimately sit in more than one shelf — "deep
clean" belongs under both "Cleaning" and "Home". A `section_id` column on
service_catalog would force a false single choice and guarantee a migration
later.

ONLY SYSTEM SERVICES
--------------------
Membership is keyed on `service_catalog` (admin-curated), never on `services`
(a worker's own priced offering). Ayush: *"the only services that will be here
will be the services based on the system given services."* Workers pick which
section their catalog service belongs to; the SET of sections is ours.

EMPTY SECTIONS DON'T RENDER
---------------------------
Enforced at read time by the endpoint (a HAVING count > 0), not by a stored
`is_visible` flag. A cached flag goes stale the moment the last service in a
section is deactivated, and then the app shows an empty shelf.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260825_sections"
down_revision = "20260824_cancel_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "service_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False, unique=True),
        sa.Column("description", sa.Text()),
        sa.Column("icon_url", sa.Text()),
        sa.Column("icon_emoji", sa.String(16)),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_service_sections_active", "service_sections", ["is_active", "sort_order"])

    op.create_table(
        "service_section_items",
        sa.Column("section_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("service_sections.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("catalog_service_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("service_catalog.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    # Reverse lookup: "which sections is this service in?" — needed by the
    # worker-facing picker, which is the opposite direction to the PK.
    op.create_index(
        "ix_service_section_items_service",
        "service_section_items",
        ["catalog_service_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_service_section_items_service", table_name="service_section_items")
    op.drop_table("service_section_items")
    op.drop_index("ix_service_sections_active", table_name="service_sections")
    op.drop_table("service_sections")
