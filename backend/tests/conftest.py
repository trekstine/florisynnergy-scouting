"""Integration test fixtures.

These tests run against a real PostgreSQL, because the faults that have
actually reached users were database-behaviour faults: a unique constraint
firing because SQLAlchemy emits INSERTs before DELETEs, a router writing a
column it was only meant to read, a compliance query counting a programme as
its own history. None of those are visible without SQL executing.

Until now the suite skipped itself wherever PostGIS was not installed, which
meant "51 passed, 7 skipped" on a developer machine and no coverage at all of
the edit paths. So: use the real database when there is one, and otherwise
start a throwaway PostgreSQL with a PostGIS stand-in (see `pgshim`) rather than
skipping. Tests that genuinely depend on real spatial arithmetic are marked
`needs_postgis` and skip under the stand-in.

Set `DATABASE_URL` to point at a real PostGIS instance to run the whole suite
for real — `docker compose up -d db` does that.
"""
from __future__ import annotations

import os
import socket
import tempfile
from urllib.parse import urlparse

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import pgshim


def _configured_url() -> str:
    from app.config import get_settings

    return get_settings().database_url


def _reachable(url: str) -> bool:
    """Is something listening where the configured URL points?

    Deliberately a bare TCP probe rather than a connection attempt: this runs
    before the application's engine exists, and creating one here would bind it
    to the wrong URL for the rest of the session.
    """
    parsed = urlparse(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    if not parsed.hostname:
        return False
    try:
        with socket.create_connection(
            (parsed.hostname, parsed.port or 5432), timeout=1.5
        ):
            return True
    except OSError:
        return False


# ── Choose the database before the application imports it ────────────────────
# app.database builds its engine at import time from the settings, so the
# decision has to be made here, at the top of conftest, and not in a fixture.
USING_STUB = False
NO_DATABASE: str | None = None
if not _reachable(_configured_url()):
    from app.config import get_settings

    try:
        pgshim.install_stub_extension()
        _DATA_DIR = tempfile.mkdtemp(prefix="florisynergy-pg-")
        os.environ["DATABASE_URL"] = pgshim.start_server(_DATA_DIR)
        get_settings.cache_clear()  # so app.database picks the new URL up
        USING_STUB = True
    except ImportError:
        # Only reachable when somebody installed requirements.txt but not
        # requirements-dev.txt. Say which, rather than skipping mutely.
        NO_DATABASE = (
            "No database. Either start one (`docker compose up -d db`) or "
            "install the test extras (`pip install -r requirements-dev.txt`), "
            "which bring a self-contained PostgreSQL."
        )

from app.main import app  # noqa: E402  (import order is load-bearing, see above)

if USING_STUB:
    pgshim.flatten_geometry_columns()


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "needs_postgis: asserts on real spatial arithmetic; skipped under the "
        "PostGIS stand-in, which returns a fixed area.",
    )


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    if not USING_STUB:
        return
    skip = pytest.mark.skip(
        reason="needs real PostGIS; running against the stand-in server"
    )
    for item in items:
        if "needs_postgis" in item.keywords:
            item.add_marker(skip)


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client():
    if NO_DATABASE:
        pytest.skip(NO_DATABASE)
    async with app.router.lifespan_context(app):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            yield ac


async def _token(client: AsyncClient, device: str, pin: str) -> str:
    resp = await client.post(
        "/api/v1/auth/login", json={"device_identifier": device, "pin": pin}
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest_asyncio.fixture(loop_scope="session")
async def admin_token(client: AsyncClient) -> str:
    return await _token(client, "web-admin", "0000")


@pytest_asyncio.fixture(loop_scope="session")
async def scout_token(client: AsyncClient) -> str:
    return await _token(client, "scout-device-01", "2001")


@pytest_asyncio.fixture(loop_scope="session")
def auth(admin_token: str) -> dict[str, str]:
    """Admin authorisation header — the role that may edit."""
    return {"Authorization": f"Bearer {admin_token}"}
