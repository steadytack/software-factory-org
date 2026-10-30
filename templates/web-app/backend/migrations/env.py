import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.models import (  # noqa: F401  (registers models on Base.metadata)
    changelog,
    comment,
    feedback,
    notification,
    rate_limit,
    revoked_token,
    site,
    survey,
    user,
)
from app.models.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata

# Tables PostGIS owns. Autogenerate would otherwise propose dropping them.
POSTGIS_TABLES = {"spatial_ref_sys"}


def include_object(obj, name, type_, reflected, compare_to):
    return not (type_ == "table" and name in POSTGIS_TABLES)


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    # Look at the application schema only. The PostGIS image puts `tiger` and
    # `topology` on the search path, so Alembic reflected 72 extension tables
    # and `alembic check` reported them all as drift (audit R3-09). PostGIS
    # itself is installed in `public`, which stays first.
    connection.execute(text("SET search_path TO public"))
    # Commit the SET now: executing on the connection opened a transaction, and
    # Alembic would otherwise join it and never commit the migrations. The
    # setting belongs to the session, so it survives the commit.
    connection.commit()
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        # Column type changes count as drift too (a String(200) that became String(100)).
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
