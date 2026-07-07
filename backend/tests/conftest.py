"""Integration test fixtures (skip if PostGIS is unreachable)."""
from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.database import engine
from app.main import app


async def _db_reachable() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client():
    if not await _db_reachable():
        pytest.skip("PostGIS not reachable — start `docker compose up db`.")
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
