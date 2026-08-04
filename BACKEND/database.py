from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from config import get_settings

settings = get_settings()

# ─────────────────────────────────────────────────────────────────────────────
# PREPARED STATEMENTS + THE SUPAVISOR TRANSACTION POOLER
#
# `settings.database_url` is the Supavisor POOLED connection (port 6543,
# transaction mode) — NOT a direct connection. An earlier comment here claimed
# the opposite; it was wrong, and that wrong assumption is what produced the
# `DuplicatePreparedStatementError` spam in the Render logs, where every
# APScheduler run of [DECAY], [ANALYTICS] and [ESCROW] was silently skipped by
# its own `except Exception` handler.
#
# Three separate settings are needed, and they are NOT interchangeable:
#
#   statement_cache_size=0
#       asyncpg's OWN cache. Already set before — necessary, but on its own it
#       does not fix anything, because it changes caching, not NAMING.
#
#   prepared_statement_name_func
#       THE ACTUAL FIX. asyncpg names statements `__asyncpg_stmt_1__`,
#       `_2__`, … from a counter that restarts at 1 on every new connection.
#       In transaction mode Supavisor multiplexes many client connections onto
#       one server backend, so two connections both issue `PREPARE
#       __asyncpg_stmt_1__` against the same backend → DuplicatePreparedStatement.
#       A uuid per statement makes collisions impossible. This is the exact
#       workaround SQLAlchemy documents for PgBouncer-style poolers
#       (asyncpg dialect docs, "Prepared Statement Name with PGBouncer").
#
#   prepared_statement_cache_size=0
#       SQLAlchemy's own per-connection LRU of prepared statements, separate
#       from asyncpg's and defaulting to 100. It must be off here for a
#       different reason: in transaction mode a client connection is pinned to
#       a backend only for the duration of a transaction. A statement prepared
#       in transaction 1 can be replayed in transaction 2 on a DIFFERENT
#       backend that never saw the PREPARE → InvalidSQLStatementNameError.
#       That failure is rarer and load-dependent, which makes it worse, not
#       better — it would surface under traffic rather than in testing.
#
# NullPool is required alongside this (SQLAlchemy's docs call it out): with a
# pooler in front, a long-lived client-side pool accumulates prepared
# statements on the shared backend. Closing the connection each time is what
# gets them released.
#
# ssl="require": Supabase requires SSL.
# ─────────────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    poolclass=NullPool,
    connect_args={
        "ssl": "require",
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    },
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
