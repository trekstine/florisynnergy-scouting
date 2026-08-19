"""Pest and disease parity with the Credible Blooms app.

The app offers seventeen pests and nine diseases from a hard-coded list; the
portal seeded six and four. Anything it sent that the portal had no row for
arrived with a null foreign key, so the observation never reached a filter, the
matrix, the pressure index or a recommendation — from the manager's chair it
had simply not happened.

These tests hold the two halves of the fix: the register covers what the app
can send, and a name nobody anticipated still lands somewhere real.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

pytestmark = pytest.mark.asyncio(loop_scope="session")

V1 = "/api/v1"
KEY = "test-integration-key"


@pytest.fixture(autouse=True)
def _configured_key(monkeypatch):
    """Open the integration for the duration of each test.

    `require_app_key` reads the setting on every call, so overriding the cached
    settings object is enough — no restart, and nothing leaks between tests.
    """
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "integration_api_key", KEY, raising=False)
    yield


def _session(scouting_for: str, items: list[dict], location: str = "Greenhouse 01"):
    return {
        "scoutingfor": scouting_for,
        "scout": "Blooms Scout",
        "location": location,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "items": items,
    }


async def _post(client, body):
    return await client.post(
        f"{V1}/integrations/blooms/session", json=body, headers={"X-App-Key": KEY}
    )


# ── the register ─────────────────────────────────────────────────────────────
async def test_every_name_the_app_offers_resolves(client, auth):
    """No name on the app's two hard-coded lists may go unresolved.

    This is the parity check. If somebody adds an option to the app's dropdown
    without adding it here, this fails and says which one.
    """
    from app.database import AsyncSessionLocal
    from app.services.matching import ReferenceResolver

    # The lists exactly as `add_scouting_screen.dart` declares them.
    app_pests = [
        "Aphids", "Caterpillars", "Caterpillers", "Farol caterpillar", "FCM",
        "Helcoverpa armigera", "Leaf borers", "Leafminers", "Live mites",
        "Mealy bugs", "Mites", "Mites damage", "Nematodes", "Redspider mites",
        "Spodoptera", "Thrips", "White flies",
    ]
    app_diseases = [
        "Powdery mildew", "Downey mildew", "Botrytis", "Rust", "Agro bacterium",
        "Fuserium", "Ryzotonia", "Leaf spot", "Rose mosaic",
    ]

    async with AsyncSessionLocal() as db:
        resolver = await ReferenceResolver.load(db)

    missing_p = [n for n in app_pests if resolver.pest(n) is None]
    missing_d = [n for n in app_diseases if resolver.disease(n) is None]
    assert not missing_p, f"pests the app can send but the portal cannot place: {missing_p}"
    assert not missing_d, f"diseases the app can send but the portal cannot place: {missing_d}"


async def test_spelling_variants_land_on_one_row(client, auth):
    """Four ways of writing spider mites must not be four pests."""
    from app.database import AsyncSessionLocal
    from app.services.matching import ReferenceResolver

    async with AsyncSessionLocal() as db:
        resolver = await ReferenceResolver.load(db)

    mites = {resolver.pest(n) for n in ("Mites", "Live mites", "Redspider mites", "Mites damage")}
    assert len(mites) == 1 and None not in mites, mites

    assert resolver.pest("Caterpillers") == resolver.pest("Caterpillars")
    assert resolver.pest("White flies") == resolver.pest("Whitefly")
    assert resolver.pest("FCM") == resolver.pest("False Codling Moth")
    assert resolver.disease("Downey mildew") == resolver.disease("Downy Mildew")


async def test_species_that_share_a_common_name_stay_apart(client, auth):
    """Spodoptera and Helicoverpa are both 'caterpillars' and both need their
    own row: merging them would recommend the wrong product for the right
    -sounding pest."""
    from app.database import AsyncSessionLocal
    from app.services.matching import ReferenceResolver

    async with AsyncSessionLocal() as db:
        resolver = await ReferenceResolver.load(db)

    ids = {
        resolver.pest("Spodoptera"),
        resolver.pest("Helcoverpa armigera"),
        resolver.pest("Caterpillars"),
        resolver.pest("Farol caterpillar"),
    }
    assert None not in ids
    assert len(ids) == 4, "these are four distinct organisms"


# ── ingest ───────────────────────────────────────────────────────────────────
async def test_a_known_pest_is_stored_against_its_row(client, auth):
    resp = await _post(
        client,
        _session("pest", [{"bed": "Bed 1", "pest": "White flies", "score": "3"}]),
    )
    assert resp.status_code in (200, 201), resp.text
    body = resp.json()
    assert body["accepted"] == 1
    assert not body["unmatched"].get("pest"), body["unmatched"]

    rows = (
        await client.get(
            f"{V1}/scouting", params={"limit": 5}, headers=auth
        )
    ).json()
    latest = [r for r in rows if r["batch_id"] == body["batch_id"]]
    assert latest and latest[0]["pest_id"] is not None


async def test_an_unknown_pest_is_created_rather_than_dropped(client, auth):
    """The client's actual complaint: a name the portal did not know vanished.

    It must now come back with a pest attached, so it can be filtered, charted
    and counted like anything else.
    """
    from app.database import AsyncSessionLocal
    from app.models import Pest

    name = f"Vine weevil {uuid.uuid4().hex[:6]}"
    resp = await _post(
        client, _session("pest", [{"bed": "Bed 2", "pest": name, "score": "4"}])
    )
    assert resp.status_code in (200, 201), resp.text
    body = resp.json()

    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(Pest).where(Pest.name == name))
        ).scalar_one_or_none()
    assert row is not None, "the unknown pest should have been created"
    # Provisional: visible everywhere, but not trusted to raise an alarm on a
    # threshold nobody has set.
    assert row.is_provisional is True

    rows = (await client.get(f"{V1}/scouting", params={"limit": 5}, headers=auth)).json()
    mine = [r for r in rows if r["batch_id"] == body["batch_id"]]
    assert mine and mine[0]["pest_id"] == row.id


async def test_the_same_unknown_name_twice_does_not_duplicate_or_fail(client, auth):
    """The regression that was live in production.

    An unmapped name was recorded as an alias with `target_id = 0`, and the
    resolver handed that 0 straight back as a foreign key. The first submission
    logged the placeholder; the second wrote `pest_id = 0` and broke on the
    constraint. Two identical rounds must both succeed, against one pest.
    """
    from app.database import AsyncSessionLocal
    from app.models import Pest

    name = f"Rose sawfly {uuid.uuid4().hex[:6]}"
    body = _session("pest", [{"bed": "Bed 3", "pest": name, "score": "2"}])

    first = await _post(client, body)
    assert first.status_code in (200, 201), first.text
    second = await _post(client, body)
    assert second.status_code in (200, 201), second.text
    assert second.json()["accepted"] == 1

    async with AsyncSessionLocal() as db:
        rows = (
            await db.execute(select(Pest).where(Pest.name == name))
        ).scalars().all()
    assert len(rows) == 1, "the second submission should reuse the first's row"


async def test_an_unknown_disease_is_created_on_a_disease_round(client, auth):
    from app.database import AsyncSessionLocal
    from app.models import Disease

    name = f"Verticillium {uuid.uuid4().hex[:6]}"
    resp = await _post(
        client, _session("disease", [{"bed": "Bed 4", "disease": name, "score": "3"}])
    )
    assert resp.status_code in (200, 201), resp.text

    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(Disease).where(Disease.name == name))
        ).scalar_one_or_none()
    assert row is not None and row.is_provisional is True


async def test_trap_rounds_do_not_invent_pests(client, auth):
    """A sticky-trap round's free text is often a trap id, not an organism.

    Creating a pest from it would fill the register with rubbish that then
    shows up in every filter the manager uses.
    """
    from app.database import AsyncSessionLocal
    from app.models import Pest

    junk = f"ST-{uuid.uuid4().hex[:8]}"
    resp = await _post(
        client,
        _session(
            "stickytrap",
            [{"bed": "Bed 5", "pest": junk, "stickytrapbugcount": "9", "stickytrapid": junk}],
        ),
    )
    assert resp.status_code in (200, 201), resp.text

    async with AsyncSessionLocal() as db:
        row = (
            await db.execute(select(Pest).where(Pest.name == junk))
        ).scalar_one_or_none()
    assert row is None, "a trap id must never become a pest"


async def test_provisional_agents_do_not_raise_recommendations(client, auth):
    """A severity-5 finding on a provisional pest is recorded, not escalated.

    The threshold that would justify escalating is a guess until an agronomist
    sets it, and a guessed alarm is worse than none.
    """
    name = f"Unknown borer {uuid.uuid4().hex[:6]}"
    resp = await _post(
        client, _session("pest", [{"bed": "Bed 6", "pest": name, "score": "5"}])
    )
    assert resp.status_code in (200, 201), resp.text
    assert resp.json()["recommendations_created"] == 0
