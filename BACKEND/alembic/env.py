"""
Alembic environment — async (matches the app's own asyncpg engine).

Connection URL comes from config.get_settings().database_url_direct (the
unpooled Supabase connection kept specifically for migrations — see
config.py's comment), NOT database_url (the Supavisor pooled connection the
running app uses). Both ultimately point at the same database; this just
avoids running DDL/advisory-lock operations through a transaction-mode
pooler, which Alembic doesn't reliably support.
"""
import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Make `BACKEND/` importable regardless of cwd when `alembic` is invoked.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import Base  # noqa: E402
import models  # noqa: E402,F401  (import registers every model on Base.metadata)
from config import get_settings  # noqa: E402

# Alembic Config object — gives access to values in alembic.ini.
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
db_url = settings.database_url_direct or settings.database_url
config.set_main_option("sqlalchemy.url", db_url)

# models.py defines every table via Base — this is what --autogenerate
# diffs the live DB against.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Generate SQL scripts without a live DB connection (`alembic upgrade --sql`)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # Same connect_args as database.py's own engine — Supabase requires
        # SSL on the direct (non-pooler) connection.
        connect_args={"ssl": "require", "statement_cache_size": 0},
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
