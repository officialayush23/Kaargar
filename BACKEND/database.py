from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from config import get_settings

settings = get_settings()

# Supabase DATABASE_URL must use the SESSION pooler (port 5432), NOT the
# transaction pooler (port 6543). Transaction mode causes asyncpg to hit
# DuplicatePreparedStatementError because pgbouncer recycles DB connections
# between sessions and asyncpg's named prepared statements collide.
#
# Session pooler URL format:
#   postgresql://postgres.<ref>:<password>@<region>.pooler.supabase.com:5432/postgres
#
# NullPool lets pgbouncer manage all connection pooling; SQLAlchemy creates
# a fresh asyncpg connection per request and releases it immediately.
# statement_cache_size=0 is belt-and-suspenders: disables asyncpg's internal
# prepared-statement cache (the only valid asyncpg connect arg for this).
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    poolclass=NullPool,
    connect_args={
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
