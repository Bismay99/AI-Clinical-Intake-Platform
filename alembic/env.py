"""
alembic/env.py

Alembic migration environment.

Key points:
  - Imports backend.models to register all ORM models with Base.metadata
    so autogenerate can detect the full schema.
  - DATABASE_URL is read from the environment (or .env), overriding alembic.ini,
    so a single alembic.ini works across environments.
  - For SQLite (used in tests), check_same_thread is added automatically
    by backend.database._make_engine.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Make sure the project root is on sys.path so `backend` is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import all models to register them with Base.metadata
import backend.models  # noqa: F401
from backend.database import Base, get_engine
from backend.config import settings

# Alembic config object
config = context.config

# Override sqlalchemy.url from environment/settings
config.set_main_option("sqlalchemy.url", settings.database_url)

# Set up loggers from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
