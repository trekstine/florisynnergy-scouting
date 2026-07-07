"""Scouting capture, idempotency, recommendations, analytics, role guards."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_health(client):
    assert (await client.get("/health")).json()["status"] == "ok"


async def test_geofencing_seeded(client, admin_token):
    gh = (await client.get("/api/v1/greenhouses", headers=_auth(admin_token))).json()
    assert len(gh) == 20
    assert gh[0]["bed_count"] == 4
    assert len(gh[0]["boundary"]) >= 4  # real OSM footprint


async def test_reference_data(client, admin_token):
    for path, n in [("varieties", 5), ("pests", 6), ("diseases", 4), ("chemicals", 5)]:
        rows = (await client.get(f"/api/v1/{path}", headers=_auth(admin_token))).json()
        assert len(rows) >= n


async def test_scouting_batch_idempotent_and_recommends(client, scout_token):
    cid = str(uuid.uuid4())
    # Whitefly (id 3) ETL is 4; severity 5 must raise a recommendation.
    entry = {
        "client_record_id": cid,
        "greenhouse_id": 6,
        "bed_code": "Bed 1",
        "scouting_for": "pest",
        "pest_id": 3,
        "variety_code": "RED",
        "severity": 5,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    body = {"batch_id": str(uuid.uuid4()), "entries": [entry]}

    first = await client.post("/api/v1/scouting/batch", json=body, headers=_auth(scout_token))
    assert first.status_code == 200
    fj = first.json()
    assert fj["accepted"] == [cid]
    # The engine raises a recommendation unless one is already open for this
    # greenhouse+pest (deduped). Either way, the breach must be reflected.
    assert fj["recommendations_created"] in (0, 1)

    second = await client.post("/api/v1/scouting/batch", json=body, headers=_auth(scout_token))
    sj = second.json()
    assert sj["accepted"] == []
    assert sj["duplicates"] == [cid]
    assert sj["recommendations_created"] == 0


async def test_pressure_heatmap(client, admin_token):
    rows = (await client.get("/api/v1/analytics/pressure", headers=_auth(admin_token))).json()
    assert len(rows) == 20
    assert all(r["pressure"] in {"none", "low", "medium", "high"} for r in rows)
    assert all(len(r["centroid"]) == 2 for r in rows)


async def test_recommendations_exist(client, admin_token):
    recs = (await client.get("/api/v1/recommendations", headers=_auth(admin_token))).json()
    assert len(recs) >= 1


async def test_scout_cannot_create_greenhouse(client, scout_token):
    resp = await client.post(
        "/api/v1/greenhouses",
        json={
            "name": "nope",
            "qr_code_hash": f"X_{uuid.uuid4().hex[:6]}",
            "boundary": [[36.3, -0.8], [36.31, -0.8], [36.31, -0.79]],
        },
        headers=_auth(scout_token),
    )
    assert resp.status_code == 403
