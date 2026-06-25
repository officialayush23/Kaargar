from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from config import get_settings

settings = get_settings()

# Direct connection to Supabase PostgreSQL (bypasses pgbouncer pooler entirely).
# URL format: postgresql+asyncpg://postgres:<password>@db.<ref>.supabase.co:5432/postgres
#
# NullPool: SQLAlchemy creates a fresh asyncpg connection per request and
# releases it immediately — suitable for development. For production at scale,
# switch to a connection pool with max_overflow and pool_size set appropriately.
#
# ssl="require": Supabase requires SSL on direct connections.
# statement_cache_size=0: disables asyncpg prepared-statement cache — safe
# default that prevents issues if pooler is re-introduced later.
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    poolclass=NullPool,
    connect_args={
        "ssl": "require",
        "statement_cache_size": 0,
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
