"""Support chat: fix support_messages RLS + enable Realtime.

Revision ID: 20260823_support_chat
Revises: 20260819_services_profession_fk
Create Date: 2026-08-23

WHY THIS EXISTS
---------------
Turning support tickets into a real two-way chat surfaced two problems that
were invisible while support was write-only.

1. `support_messages` RLS was `USING (auth.uid() = sender_id)`.

   Read that carefully: a user could only SELECT messages they had SENT
   THEMSELVES. Every admin reply was invisible to the person who opened the
   ticket. That was harmless while the only client was the REST API (the
   backend reads through asyncpg with the service role, which bypasses RLS),
   but it makes a Realtime-backed chat impossible — Realtime evaluates RLS per
   subscriber, so the user would receive their own messages echoed back and
   never a single reply. It is also wrong on its own terms: a ticket
   participant should see their whole thread.

   Replaced with "you can read/write messages on tickets you own". Note the
   split: SELECT/INSERT are now separate policies, because the read rule
   ("messages on my tickets") and the write rule ("messages on my tickets,
   sent as me") are genuinely different — the old ALL policy let a user insert
   a row with any sender_id as long as it equalled their own uid, but said
   nothing about which ticket they were writing into.

2. `support_messages` was not in the `supabase_realtime` publication, so no
   postgres_changes event was ever emitted for it. Added.

`support_tickets`' own policy (`auth.uid() = user_id`) was already correct and
is left alone.
"""

from alembic import op

revision = "20260823_support_chat"
down_revision = "20260819_services_profession_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. RLS ────────────────────────────────────────────────────────────
    # All three drops are IF EXISTS so this is safe to re-run — the SQL was
    # applied to the live database directly (so support chat could be tested
    # before Alembic is stamped), and `alembic upgrade head` will replay it.
    op.execute("DROP POLICY IF EXISTS sm_self ON public.support_messages;")
    op.execute("DROP POLICY IF EXISTS sm_read_own_tickets ON public.support_messages;")
    op.execute("DROP POLICY IF EXISTS sm_write_own_tickets ON public.support_messages;")

    op.execute(
        """
        CREATE POLICY sm_read_own_tickets ON public.support_messages
        FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM public.support_tickets t
                WHERE t.id = support_messages.ticket_id
                  AND t.user_id = auth.uid()
            )
        );
        """
    )

    # Writing requires BOTH: the ticket is mine, and I'm not forging a sender.
    # sender_role is deliberately constrained too — without it a user could
    # insert a message labelled 'admin' into their own ticket and the client,
    # which styles messages purely by sender_role, would render it as an
    # official support reply.
    op.execute(
        """
        CREATE POLICY sm_write_own_tickets ON public.support_messages
        FOR INSERT
        WITH CHECK (
            sender_id = auth.uid()
            AND sender_role <> 'admin'
            AND EXISTS (
                SELECT 1 FROM public.support_tickets t
                WHERE t.id = support_messages.ticket_id
                  AND t.user_id = auth.uid()
            )
        );
        """
    )

    # ── 2. Realtime ───────────────────────────────────────────────────────
    # Idempotent: adding a table already in the publication raises.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public'
                  AND tablename = 'support_messages'
            ) THEN
                ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
            END IF;
        END $$;
        """
    )

    # Realtime sends only the primary key in the `old` record on UPDATE/DELETE
    # unless REPLICA IDENTITY is FULL. Chat only needs INSERT, so DEFAULT is
    # fine and cheaper on WAL volume — noted here so nobody "fixes" it later.


def downgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime'
                  AND schemaname = 'public'
                  AND tablename = 'support_messages'
            ) THEN
                ALTER PUBLICATION supabase_realtime DROP TABLE public.support_messages;
            END IF;
        END $$;
        """
    )
    op.execute("DROP POLICY IF EXISTS sm_write_own_tickets ON public.support_messages;")
    op.execute("DROP POLICY IF EXISTS sm_read_own_tickets ON public.support_messages;")
    op.execute(
        """
        CREATE POLICY sm_self ON public.support_messages
        FOR ALL USING (auth.uid() = sender_id);
        """
    )
