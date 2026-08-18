"""Run the integration tests without a PostGIS server available.

The suite is written against the real database, which is right: the bugs that
have actually reached users were ORM and serialisation bugs that no unit test
would have caught — a unique constraint firing because SQLAlchemy orders
INSERTs before DELETEs, a router wiping a column it was only meant to read.
Those only appear when SQL runs.

The problem is that they only ran where PostGIS was installed, so on any
machine without it `conftest` skipped and the edit paths went untested. This
module closes that gap: it starts a throwaway PostgreSQL (via the `pgserver`
wheel, which ships its own binaries and needs no root) and stands in for the
two things PostGIS provides that the app touches.

What is faked, and what that costs:

* ``Geometry`` columns compile to ``TEXT``. Boundaries still round-trip as WKT,
  so anything that stores or reads one behaves normally.
* ``ST_Area`` returns a fixed area. **Any test asserting on a computed hectare
  figure is therefore meaningless here** and must be marked ``needs_postgis``.

Everything else — every constraint, every cascade, every flush ordering
question — is the real database doing the real thing, which is the part that
has been biting.
"""
from __future__ import annotations

import os

from sqlalchemy import Text
from sqlalchemy.types import TypeDecorator

# A hectare, so a greenhouse under the shim has a plausible non-zero area
# rather than a zero that would divide badly somewhere and look like a bug.
STUB_AREA_M2 = 10_000.0

# Installed as an extension literally named "postgis", so the application's own
# `CREATE EXTENSION IF NOT EXISTS postgis` succeeds unmodified. Faking it at the
# database rather than patching the lifespan means the tests exercise the real
# boot path, including the schema sync that has broken twice.
_EXTENSION_SQL = f"""
-- `boundary::geography` needs a type of that name; a domain over text gives one,
-- and the cast from text comes with it.
CREATE DOMAIN geography AS text;
CREATE FUNCTION geography(text) RETURNS geography
  AS $$ SELECT $1::geography $$ LANGUAGE sql IMMUTABLE;
CREATE FUNCTION st_area(geography) RETURNS double precision
  AS $$ SELECT {STUB_AREA_M2}::double precision $$ LANGUAGE sql IMMUTABLE;
CREATE FUNCTION st_area(text) RETURNS double precision
  AS $$ SELECT {STUB_AREA_M2}::double precision $$ LANGUAGE sql IMMUTABLE;
"""

_CONTROL = """comment = 'stand-in for PostGIS, for tests only'
default_version = '0.0'
relocatable = true
"""


def install_stub_extension() -> None:
    """Put a `postgis` extension into the bundled server that is not PostGIS.

    Only ever writes into the `pgserver` wheel's own private install, which is
    a throwaway inside the virtualenv — it cannot reach a real database.
    """
    import pathlib

    import pgserver

    ext = (
        pathlib.Path(pgserver.__file__).parent
        / "pginstall"
        / "share"
        / "postgresql"
        / "extension"
    )
    if not ext.is_dir():  # pragma: no cover - depends on the wheel's layout
        raise RuntimeError(f"pgserver extension directory not found at {ext}")
    (ext / "postgis.control").write_text(_CONTROL)
    (ext / "postgis--0.0.sql").write_text(_EXTENSION_SQL)


class _GeometryAsText(TypeDecorator):
    """Store a geometry as the text of its WKB/WKT, without PostGIS.

    The seed and the geo helpers hand SQLAlchemy `WKBElement` / `WKTElement`
    objects. A plain `Text` column rejects those outright, so the shim needs to
    accept them and give back something the same helpers can read.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ANN001, D102
        if value is None or isinstance(value, str):
            return value
        # Both element types carry the geometry in `.desc` — hex WKB for a
        # WKBElement, the WKT string for a WKTElement.
        return str(getattr(value, "desc", value))

    def process_result_value(self, value, dialect):  # noqa: ANN001, D102
        """Hand back the element type the application expects.

        Without this the boundary reads as a bare string and `to_shape` throws,
        which would fail tests for a reason that has nothing to do with the
        code under test. The geometry itself is exact — it is the same WKB that
        went in — so these round-trips are honest; only `ST_Area` is stubbed.
        """
        if value is None:
            return None
        from geoalchemy2 import WKBElement, WKTElement

        text_value = str(value)
        if text_value[:1].isalpha():  # "POLYGON((...))"
            return WKTElement(text_value, srid=4326)
        return WKBElement(text_value, srid=4326)


def flatten_geometry_columns() -> None:
    """Make GeoAlchemy2's ``Geometry`` columns ordinary ``TEXT``.

    Done by rewriting the column types on the metadata rather than by
    overriding DDL compilation, because GeoAlchemy2 also installs create-time
    listeners that add a GIST spatial index — which a text column cannot take.
    With no ``Geometry`` left on the table, those listeners find nothing to do
    and stay out of the way.
    """
    from app.database import Base

    for table in Base.metadata.tables.values():
        geo = {
            c.name
            for c in table.columns
            if type(c.type).__module__.startswith("geoalchemy2")
        }
        if not geo:
            continue
        # Drop the spatial indexes *before* retyping the columns: they are
        # identified by the column type, and a GIST index over TEXT has no
        # operator class, so leaving one behind fails create_all outright.
        for index in list(table.indexes):
            if geo & {c.name for c in index.columns}:
                table.indexes.discard(index)
        for column in table.columns:
            if column.name in geo:
                column.type = _GeometryAsText()


def start_server(tmp_dir: str) -> str:
    """Boot a private PostgreSQL and return its async SQLAlchemy URL."""
    import pgserver

    db = pgserver.get_server(tmp_dir)
    uri = db.get_uri()  # postgresql://...
    # Keep a reference alive for the life of the process; the server shuts down
    # when it is collected.
    globals()["_SERVER"] = db
    return uri.replace("postgresql://", "postgresql+asyncpg://", 1)


def env_url_is_set() -> bool:
    return bool(os.environ.get("DATABASE_URL"))
