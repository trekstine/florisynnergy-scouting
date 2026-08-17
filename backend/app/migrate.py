"""Bring existing tables up to date with the models, additively.

``Base.metadata.create_all`` creates missing *tables* and nothing else. Add a
column to a model that is already deployed and the table stays as it was, so
the first query touching that column fails at runtime — which is exactly how
``fertilisers.is_organic`` took the API down on boot.

The previous defence was a hand-written list of ``ALTER TABLE ... ADD COLUMN IF
NOT EXISTS`` statements in the lifespan. It worked, but it only worked when
somebody remembered to add to it, and across one afternoon of model changes I
forgot four times. So the list is derived instead: compare what the models
declare against what the database actually has, and add what is missing.

Deliberately narrow. This only ever **adds** columns:

* never drops a column, even one the models no longer declare — a column that
  looks unused is exactly the one holding data somebody needs;
* never alters a type, changes a default, or touches an index or constraint;
* adds ``NOT NULL`` only where there is a default to backfill existing rows
  with, and otherwise adds the column nullable and says so in the log.

Anything beyond that is a real migration and wants a real migration tool.
"""
from __future__ import annotations

import logging

from sqlalchemy import DefaultClause, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncConnection

from . import models
from .database import Base

# Importing the models is load-bearing rather than tidiness: `Base.metadata` is
# populated as a side effect of the classes being defined, so relying on some
# other import having happened first would make this silently do nothing. The
# reference below keeps the import from being tidied away by a linter.
_MODELS_LOADED = models.Base is Base

log = logging.getLogger("uvicorn.error")


async def _existing_columns(conn: AsyncConnection) -> dict[str, set[str]]:
    """Every column the database currently has, keyed by table."""
    rows = await conn.execute(
        text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema = current_schema()"
        )
    )
    out: dict[str, set[str]] = {}
    for table, column in rows:
        out.setdefault(table, set()).add(column)
    return out


def _literal_default(column) -> str | None:
    """A SQL literal to backfill existing rows with, if we can find one.

    Only simple scalars: a callable or a SQL expression default belongs to the
    application, and guessing at what it would produce for historical rows is
    how you end up with a column full of today's timestamp.
    """
    if isinstance(column.server_default, DefaultClause):
        arg = getattr(column.server_default, "arg", None)
        if isinstance(arg, str):
            return arg
        return None

    default = getattr(column, "default", None)
    if default is None or getattr(default, "is_callable", False):
        return None
    value = getattr(default, "arg", None)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    return None


async def sync_columns(conn: AsyncConnection) -> list[str]:
    """Add any column the models declare and the database lacks.

    Returns the statements applied, so a deploy log says what changed.
    """
    have = await _existing_columns(conn)
    applied: list[str] = []

    for table in Base.metadata.sorted_tables:
        present = have.get(table.name)
        if present is None:
            continue  # create_all just made it, or will; nothing to reconcile.

        for column in table.columns:
            if column.name in present:
                continue

            type_sql = column.type.compile(dialect=postgresql.dialect())
            default = _literal_default(column)

            clause = f'ADD COLUMN IF NOT EXISTS "{column.name}" {type_sql}'
            if default is not None:
                clause += f" DEFAULT {default}"
            # NOT NULL is only safe when existing rows can be given a value.
            if not column.nullable and default is not None:
                clause += " NOT NULL"

            statement = f'ALTER TABLE "{table.name}" {clause};'
            await conn.exec_driver_sql(statement)
            applied.append(statement)

            if not column.nullable and default is None:
                log.warning(
                    "Added %s.%s as nullable: the model says NOT NULL but there "
                    "is no default to backfill existing rows with. Set the "
                    "values and add the constraint by hand.",
                    table.name,
                    column.name,
                )

    if applied:
        log.info("Schema sync added %d column(s):", len(applied))
        for statement in applied:
            log.info("  %s", statement)

    return applied
