"""Editing a spray programme and a fertigation sheet, end to end.

Every case here is a fault that reached the user. They are written against the
running application and a real database because that is the only place any of
them was visible: each one was a correct-looking router failing on database
behaviour — constraint ordering, a self-referential query, a column written
when it should have been left alone.

If one of these ever fails again it fails here, before a deploy, rather than in
a greenhouse.
"""
from __future__ import annotations

import uuid
from datetime import date

import pytest

pytestmark = pytest.mark.asyncio(loop_scope="session")

V1 = "/api/v1"


# ────────────────────────────── helpers ──────────────────────────────────────
async def _spray_payload(client, auth, **over):
    """A minimal, compliant one-product programme on a quiet block."""
    chems = (await client.get(f"{V1}/chemicals", headers=auth)).json()
    body = {
        "greenhouse_id": 2,
        "bed_code": "Bed 1",
        "variety_code": None,
        "type_of_application": "Foliar",
        "coverage": "Full Cover",
        "volume_of_water_l": 1000,
        "start_date": date.today().isoformat(),
        "items": [{"chemical_id": chems[0]["id"], "rate": 50}],
        # Compliance is exercised on its own elsewhere; these tests are about
        # whether an edit round-trips, so they do not fight the RAC rotation.
        "override": True,
    }
    body.update(over)
    return body


async def _create_program(client, auth, **over):
    resp = await client.post(
        f"{V1}/spray/program", json=await _spray_payload(client, auth, **over), headers=auth
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _fertigation_payload(client, auth, **over):
    ferts = (await client.get(f"{V1}/fertigation/fertilisers", headers=auth)).json()
    assert ferts, "the fertiliser register seeds on boot; it should not be empty"
    body = {
        "activity": "fertigation",
        "event_date": date.today().isoformat(),
        "start_time": "07:00",
        "blocks": [{"greenhouse_id": 1}, {"greenhouse_id": 2}],
        "type_of_application": "Drip",
        "volume_m3": 1000,
        "fertiliser_rate_l_m3": 6,
        "acid_rate_l_m3": 2,
        "tanks": [
            {
                "code": "A",
                "volume_l": 1000,
                "sets_mode": "auto",
                "sets": 1,
                "lines": [
                    {
                        "fertiliser_id": ferts[0]["id"],
                        "fertiliser_code": ferts[0]["code"],
                        "quantity": 25,
                        "unit": ferts[0]["unit"],
                        "position": 0,
                    }
                ],
            }
        ],
        "sources": [{"source": "Borehole", "volume_m3": 1000}],
    }
    body.update(over)
    return body


async def _create_fertigation(client, auth, **over):
    resp = await client.post(
        f"{V1}/fertigation", json=await _fertigation_payload(client, auth, **over), headers=auth
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ─────────────────────────────── spray ───────────────────────────────────────
async def test_spray_edit_does_not_fail_compliance_against_itself(client, auth):
    """The programme's own rows are not prior sprays.

    `_build_program` screens every product before writing, and on an edit the
    rows being replaced are still on file. Without excluding them, the RAC
    rotation check counted the programme's own chemical as a recent spray on
    that block and refused every edit — including one that changed nothing.
    """
    created = await _create_program(client, auth)
    program_id = created["program_id"]
    chemical_id = created["records"][0]["chemical_id"]

    # Re-save the identical programme, and this time without the override, so
    # the only thing that could block it is its own history.
    body = await _spray_payload(client, auth)
    body["items"] = [{"chemical_id": chemical_id, "rate": 50}]
    body["override"] = False

    resp = await client.put(f"{V1}/spray/programs/{program_id}", json=body, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["program_id"] == program_id


async def test_spray_edit_keeps_its_id_and_applies_the_change(client, auth):
    created = await _create_program(client, auth)
    program_id = created["program_id"]

    body = await _spray_payload(client, auth)
    body["items"] = [
        {"chemical_id": created["records"][0]["chemical_id"], "rate": 75}
    ]
    body["comments"] = "rate corrected"

    resp = await client.put(f"{V1}/spray/programs/{program_id}", json=body, headers=auth)
    assert resp.status_code == 200, resp.text
    out = resp.json()
    # Same identity: the approval sheet URL and any scouting link still resolve.
    assert out["program_id"] == program_id
    assert len(out["records"]) == 1
    # The stored rate is a *label*, not a number: `compose_spray` writes
    # f"{rate:g}/100L". This is the whole reason the portal's edit was broken —
    # it did Number("75/100L"), got NaN, sent 0, and the server rejects 0
    # because the field is gt=0. Asserting the real shape here keeps the two
    # sides honest about what is actually on the record.
    assert out["records"][0]["rate"] == "75/100L"

    # And the old rows are gone rather than doubled up. Read it back off the
    # list, which is what the portal does — an edit that left the replaced rows
    # behind would double every product on the programme.
    rows = (await client.get(f"{V1}/spray", headers=auth)).json()
    mine = [r for r in rows if r["program_id"] == program_id]
    assert len(mine) == 1, f"expected one row for the programme, got {len(mine)}"
    assert mine[0]["rate"] == "75/100L"


async def test_spray_edit_rejects_an_empty_product_list(client, auth):
    """The portal now refuses this client-side; the server must too."""
    created = await _create_program(client, auth)
    body = await _spray_payload(client, auth)
    body["items"] = []
    resp = await client.put(
        f"{V1}/spray/programs/{created['program_id']}", json=body, headers=auth
    )
    assert resp.status_code == 422


async def test_spray_edit_refused_once_applied(client, auth):
    """A sprayed programme is history, not a draft."""
    created = await _create_program(client, auth)
    program_id = created["program_id"]

    marked = await client.patch(
        f"{V1}/spray/programs/{program_id}/status",
        json={"status": "applied"},
        headers=auth,
    )
    assert marked.status_code == 200, marked.text

    resp = await client.put(
        f"{V1}/spray/programs/{program_id}",
        json=await _spray_payload(client, auth),
        headers=auth,
    )
    assert resp.status_code == 409
    assert "applied" in resp.json()["detail"]


async def test_spray_cannot_be_moved_to_another_block(client, auth):
    created = await _create_program(client, auth)
    body = await _spray_payload(client, auth, greenhouse_id=3)
    resp = await client.put(
        f"{V1}/spray/programs/{created['program_id']}", json=body, headers=auth
    )
    assert resp.status_code == 422


# ──────────────────────────── fertigation ────────────────────────────────────
async def test_fertigation_edit_with_unchanged_blocks(client, auth):
    """Re-saving the same greenhouses must not violate uq_fertigation_block.

    `_apply` clears the child rows and re-adds them. SQLAlchemy's unit of work
    emits INSERTs before DELETEs for the same table, so the replacement row
    collided with the one not yet deleted — and the case that broke was the
    ordinary one: an edit that keeps the same blocks.
    """
    created = await _create_fertigation(client, auth)
    doc_id = created["doc_id"]

    body = await _fertigation_payload(client, auth)
    body["comments"] = "unchanged blocks, corrected note"

    resp = await client.put(f"{V1}/fertigation/{doc_id}", json=body, headers=auth)
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert {b["greenhouse_id"] for b in out["blocks"]} == {1, 2}
    assert len(out["blocks"]) == 2  # not doubled
    assert out["comments"] == "unchanged blocks, corrected note"


async def test_fertigation_edit_can_change_the_blocks(client, auth):
    created = await _create_fertigation(client, auth)
    body = await _fertigation_payload(client, auth)
    body["blocks"] = [{"greenhouse_id": 2}, {"greenhouse_id": 3}]

    resp = await client.put(
        f"{V1}/fertigation/{created['doc_id']}", json=body, headers=auth
    )
    assert resp.status_code == 200, resp.text
    assert {b["greenhouse_id"] for b in resp.json()["blocks"]} == {2, 3}


async def test_fertigation_edit_keeps_the_reference(client, auth):
    """A field the edit form does not carry must not be erased by the edit.

    `_apply` wrote `reference` unconditionally from a payload that defaults it
    to None, so correcting a rate silently blanked the sheet's reference
    number — data loss with no error anywhere.
    """
    created = await _create_fertigation(client, auth, reference="FRT-0001")
    assert created["reference"] == "FRT-0001"

    body = await _fertigation_payload(client, auth)  # no `reference` key at all
    resp = await client.put(
        f"{V1}/fertigation/{created['doc_id']}", json=body, headers=auth
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reference"] == "FRT-0001"


async def test_fertigation_edit_rebuilds_tanks_without_duplicating(client, auth):
    created = await _create_fertigation(client, auth)
    ferts = (await client.get(f"{V1}/fertigation/fertilisers", headers=auth)).json()

    body = await _fertigation_payload(client, auth)
    body["tanks"][0]["lines"][0]["quantity"] = 40
    body["tanks"].append(
        {
            "code": "B",
            "volume_l": 1000,
            "sets_mode": "auto",
            "sets": 1,
            "lines": [
                {
                    "fertiliser_id": ferts[1]["id"],
                    "fertiliser_code": ferts[1]["code"],
                    "quantity": 10,
                    "unit": ferts[1]["unit"],
                    "position": 0,
                }
            ],
        }
    )

    resp = await client.put(
        f"{V1}/fertigation/{created['doc_id']}", json=body, headers=auth
    )
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert [t["code"] for t in out["tanks"]] == ["A", "B"]
    assert out["tanks"][0]["lines"][0]["quantity"] == 40


async def test_fertigation_edit_survives_repeated_saves(client, auth):
    """Three saves in a row. The constraint fault only showed on the second."""
    created = await _create_fertigation(client, auth)
    doc_id = created["doc_id"]
    for n in range(3):
        body = await _fertigation_payload(client, auth)
        body["comments"] = f"save {n}"
        resp = await client.put(f"{V1}/fertigation/{doc_id}", json=body, headers=auth)
        assert resp.status_code == 200, f"save {n} failed: {resp.text}"
    final = (await client.get(f"{V1}/fertigation/{doc_id}", headers=auth)).json()
    assert final["comments"] == "save 2"
    assert len(final["blocks"]) == 2
    assert len(final["tanks"]) == 1


async def test_fertigation_edit_refused_once_signed(client, auth):
    created = await _create_fertigation(client, auth)
    doc_id = created["doc_id"]

    slots = (
        await client.get(
            f"{V1}/approvals/slots", params={"document_type": "fertigation"}, headers=auth
        )
    ).json()
    assert slots, "fertigation should have default signature slots"

    signed = await client.post(
        f"{V1}/approvals/fertigation/{doc_id}/sign",
        json={
            "slot_id": slots[0]["id"],
            # A 1×1 transparent PNG.
            "image_data_url": (
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAf"
                "FcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            ),
            "pin": "0000",
        },
        headers=auth,
    )
    assert signed.status_code in (200, 201), signed.text

    resp = await client.put(
        f"{V1}/fertigation/{doc_id}",
        json=await _fertigation_payload(client, auth),
        headers=auth,
    )
    assert resp.status_code == 409
    assert "signed" in resp.json()["detail"].lower()


async def test_fertigation_client_record_ids_stay_unique(client, auth):
    """Two sheets on the same day and blocks are two sheets, not a conflict."""
    a = await _create_fertigation(client, auth)
    b = await _create_fertigation(client, auth)
    assert a["doc_id"] != b["doc_id"]
    assert uuid.UUID(a["doc_id"]) and uuid.UUID(b["doc_id"])
