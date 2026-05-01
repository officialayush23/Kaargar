from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from config import get_settings

settings = get_settings()

# Supabase uses pgbouncer in transaction mode (port 6543).
# SQLAlchemy's own connection pool fights with pgbouncer — use NullPool so
# pgbouncer owns all pooling. statement_cache_size=0 disables asyncpg's
# prepared-statement cache which is incompatible with transaction pooling.
engine = create_async_engine(
    settings.database_url,
    echo=settings.app_env == "development",
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
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
