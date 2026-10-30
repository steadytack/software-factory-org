from collections.abc import AsyncGenerator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a transactional session."""
    async with SessionFactory() as session:
        async with session.begin():
            yield session


# Every endpoint takes its session through this, so the transaction commits
# *before* the response is sent. By default FastAPI runs a yield dependency's
# exit code after the response ("request" scope): a client could get a 201
# before the COMMIT, and a request sent straight after — the offline outbox
# replaying a new site and then its survey — would not find the row (404),
# while a commit that failed would go unreported.
SessionDep = Depends(get_session, scope="function")
