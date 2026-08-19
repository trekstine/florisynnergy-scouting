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
        # 6,000 L of solution — the report's six sets.
        "solution_l": 6000,
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


# ─────────────────────── fertigation analytics ───────────────────────────────
async def test_fertigation_cost_by_block_does_not_multiply_the_bill(client, auth):
    """A sheet feeding two blocks is one cost shared, not two costs.

    Grouping by block is the obvious way to answer "where is the money going",
    and the obvious implementation counts the whole sheet against every block
    it touched — which reports a farm's feeding bill at several times its real
    size. The block totals must add back up to the sheet total.
    """
    created = await _create_fertigation(client, auth)  # blocks 1 and 2
    doc_id = created["doc_id"]
    sheet_cost = created["total_cost"]
    assert sheet_cost > 0, "the seeded fertiliser needs a price for this to mean anything"

    rows = (
        await client.get(
            f"{V1}/analytics/fertigation/cost", params={"group": "block"}, headers=auth
        )
    ).json()
    by_block = {r["key"]: r for r in rows}
    assert len(by_block) >= 2

    total = sum(r["total_cost"] for r in rows)
    phase_rows = (
        await client.get(
            f"{V1}/analytics/fertigation/cost", params={"group": "phase"}, headers=auth
        )
    ).json()
    phase_total = sum(r["total_cost"] for r in phase_rows)
    # Apportioning is lossy to the penny; anything beyond that is double count.
    assert abs(total - phase_total) < 1.0, (total, phase_total)

    await client.delete(f"{V1}/fertigation/{doc_id}", headers=auth)


async def test_the_chain_follows_the_document(client, auth):
    """6,000 L over 30 ha: 200 L/ha, 33.33 m³/ha, 1,000 m³ of water.

    The whole of the report's worked example, end to end through the API. The
    litres are the input; everything else is derived, and nothing is accepted
    from the caller.
    """
    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 6000
    body["area_ha"] = 30

    resp = await client.post(f"{V1}/fertigation", json=body, headers=auth)
    assert resp.status_code == 201, resp.text
    out = resp.json()

    assert out["solution_l"] == 6000
    assert out["l_per_ha"] == 200.0        # 6,000 / 30
    assert out["m3_per_ha"] == 33.33       # 200 / 6
    assert out["volume_m3"] == 1000.0      # 6,000 / 6, not 6,000 / 1,000
    assert out["acid_required_l"] == 2000.0  # 2 L/m³ × 1,000 m³

    await client.delete(f"{V1}/fertigation/{out['doc_id']}", headers=auth)


async def test_the_water_is_not_a_thousandth_of_the_litres(client, auth):
    """The regression that made this rewrite necessary.

    Treating the keyed litres as water gave 6 m³ where the document gives
    1,000 — the pump rate, not a unit conversion, relates the two.
    """
    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 6000
    body["area_ha"] = 30
    out = (await client.post(f"{V1}/fertigation", json=body, headers=auth)).json()
    assert out["volume_m3"] != 6.0
    assert out["volume_m3"] == 1000.0
    await client.delete(f"{V1}/fertigation/{out['doc_id']}", headers=auth)


async def test_sets_come_from_the_litres_not_from_a_default(client, auth):
    """Six thousand litres is six make-ups of a 1,000 L tank."""
    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 6000
    out = (await client.post(f"{V1}/fertigation", json=body, headers=auth)).json()
    tank = out["tanks"][0]
    assert tank["volume_l"] == 1000
    assert tank["effective_sets"] == 6.0
    assert tank["implied_sets"] == 6.0
    await client.delete(f"{V1}/fertigation/{out['doc_id']}", headers=auth)


async def test_five_sets_is_as_legitimate_as_six(client, auth):
    """"There is no predefined number of sets (this is the volume used)."""
    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 5000
    out = (await client.post(f"{V1}/fertigation", json=body, headers=auth)).json()
    assert out["tanks"][0]["effective_sets"] == 5.0
    assert out["volume_m3"] == pytest.approx(833.33, abs=0.01)
    await client.delete(f"{V1}/fertigation/{out['doc_id']}", headers=auth)


async def test_each_block_gets_the_reports_own_per_greenhouse_figure(client, auth):
    """"m³ used = 33.33 × (Greenhouse Area in ha)"."""
    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 6000
    body["area_ha"] = 30
    out = (await client.post(f"{V1}/fertigation", json=body, headers=auth)).json()

    rate = out["m3_per_ha"]
    for block in out["blocks"]:
        if block["area_ha"]:
            assert block["derived_m3"] == pytest.approx(
                round(rate * block["area_ha"], 2), abs=0.01
            )
    await client.delete(f"{V1}/fertigation/{out['doc_id']}", headers=auth)


async def test_the_rate_is_never_accepted_from_the_caller(client, auth):
    """It describes the litres and the area; a second copy could disagree."""
    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 6000
    body["area_ha"] = 30
    body["target_m3_per_ha"] = 999
    body["volume_m3"] = 12345
    out = (await client.post(f"{V1}/fertigation", json=body, headers=auth)).json()
    assert out["m3_per_ha"] == 33.33
    assert out["volume_m3"] == 1000.0
    await client.delete(f"{V1}/fertigation/{out['doc_id']}", headers=auth)


async def test_the_chain_follows_a_correction(client, auth):
    """Halve the litres and every derived figure halves with it."""
    created = await _create_fertigation(client, auth, solution_l=6000, area_ha=30)
    assert created["m3_per_ha"] == 33.33

    body = await _fertigation_payload(client, auth)
    body["solution_l"] = 3000
    body["area_ha"] = 30
    resp = await client.put(
        f"{V1}/fertigation/{created['doc_id']}", json=body, headers=auth
    )
    assert resp.status_code == 200, resp.text
    out = resp.json()
    assert out["l_per_ha"] == 100.0
    assert out["m3_per_ha"] == 16.67
    assert out["volume_m3"] == 500.0
    assert out["tanks"][0]["effective_sets"] == 3.0

    await client.delete(f"{V1}/fertigation/{created['doc_id']}", headers=auth)


async def test_water_variance_compares_against_the_phase_average(client, auth):
    """Heavier or lighter than usual for that block — the useful question."""
    made = []
    for litres in (4800, 6000, 7200):  # 16, 20 and 24 m³/ha over 40 ha
        body = await _fertigation_payload(client, auth)
        body["area_ha"] = 40
        body["solution_l"] = litres
        body["phase"] = "Variance Test Phase"
        resp = await client.post(f"{V1}/fertigation", json=body, headers=auth)
        assert resp.status_code == 201, resp.text
        made.append(resp.json()["doc_id"])

    rows = (await client.get(f"{V1}/analytics/fertigation/water", headers=auth)).json()
    mine = {r["doc_id"]: r for r in rows if r["doc_id"] in made}
    assert len(mine) == 3

    by_rate = {r["m3_per_ha"]: r for r in mine.values()}
    assert sorted(by_rate) == [20.0, 25.0, 30.0]
    assert by_rate[25.0]["phase_avg_m3_per_ha"] == 25.0
    assert by_rate[20.0]["variance_pct"] == pytest.approx(-20.0, abs=0.1)
    assert by_rate[30.0]["variance_pct"] == pytest.approx(20.0, abs=0.1)

    for doc_id in made:
        await client.delete(f"{V1}/fertigation/{doc_id}", headers=auth)


async def test_a_phase_with_one_sheet_has_no_variance(client, auth):
    """No 'usual' to compare against is an absence of evidence, not agreement.

    Reporting 0% here would read as "exactly on plan" when the truth is that
    there is nothing to be on plan against.
    """
    body = await _fertigation_payload(client, auth)
    body["area_ha"] = 40
    body["phase"] = f"Lonely Phase {uuid.uuid4().hex[:6]}"
    resp = await client.post(f"{V1}/fertigation", json=body, headers=auth)
    assert resp.status_code == 201, resp.text
    doc_id = resp.json()["doc_id"]

    rows = (await client.get(f"{V1}/analytics/fertigation/water", headers=auth)).json()
    mine = next(r for r in rows if r["doc_id"] == doc_id)
    assert mine["variance_pct"] is None
    assert mine["phase_avg_m3_per_ha"] is None

    await client.delete(f"{V1}/fertigation/{doc_id}", headers=auth)


async def test_fertigation_usage_counts_sets_not_just_line_quantity(client, auth):
    """25 kg in a tank made up six times is 150 kg out of the store.

    Reporting the line quantity alone would understate every order the farm
    places off the back of this table.
    """
    created = await _create_fertigation(client, auth)
    tank = created["tanks"][0]
    sets = tank["effective_sets"]
    assert sets > 1, "the fixture should imply more than one set"

    rows = (await client.get(f"{V1}/analytics/fertigation/usage", headers=auth)).json()
    line = tank["lines"][0]
    mine = next(r for r in rows if r["code"] == line["fertiliser_code"])
    assert mine["quantity"] >= line["quantity"] * sets - 0.01

    await client.delete(f"{V1}/fertigation/{created['doc_id']}", headers=auth)


async def test_fertigation_analytics_honour_the_date_range(client, auth):
    created = await _create_fertigation(client, auth)
    far_past = {"start": "2000-01-01", "end": "2000-12-31"}
    rows = (
        await client.get(
            f"{V1}/analytics/fertigation/water", params=far_past, headers=auth
        )
    ).json()
    assert all(r["doc_id"] != created["doc_id"] for r in rows)
    await client.delete(f"{V1}/fertigation/{created['doc_id']}", headers=auth)


# ─────────────────── the scouting a spray answers ────────────────────────────
async def test_spray_stores_the_scouting_window(client, auth):
    """A programme may answer more than one walk, so the reference is a range."""
    body = await _spray_payload(client, auth)
    body["scout_report_date"] = "2026-08-06"
    body["scout_report_end_date"] = "2026-08-10"

    resp = await client.post(f"{V1}/spray/program", json=body, headers=auth)
    assert resp.status_code == 201, resp.text
    head = resp.json()["records"][0]
    assert head["scout_report_date"] == "2026-08-06"
    assert head["scout_report_end_date"] == "2026-08-10"


async def test_a_single_report_reads_as_a_one_day_window(client, auth):
    """Omitting the end must not leave an open interval.

    An unbounded end would let a programme claim every round walked after it
    was raised — scouting that had not happened when somebody decided to spray.
    """
    body = await _spray_payload(client, auth)
    body["scout_report_date"] = "2026-08-06"
    body.pop("scout_report_end_date", None)

    resp = await client.post(f"{V1}/spray/program", json=body, headers=auth)
    assert resp.status_code == 201, resp.text
    head = resp.json()["records"][0]
    assert head["scout_report_end_date"] == "2026-08-06"


async def test_the_scouting_window_is_part_of_what_is_signed(client, auth):
    """Changing the evidence under a signature must read as an alteration.

    The hash covers the window; if it did not, a signed sheet's scouting
    reference could be rewritten and the document would still verify.
    """
    from app.services.signing import spray_program_content
    from types import SimpleNamespace
    from datetime import date as _d

    def rec(**over):
        base = dict(
            program_id="p1", greenhouse_id=7, bed_code="Bed 4", partition_no=None,
            variety_code=None, type_of_application="Foliar", coverage="Full Cover",
            volume_of_water="1000 L", area_ha=1.0, start_date=_d(2026, 8, 11),
            start_time="07:00", scout_report_date=_d(2026, 8, 6),
            scout_report_end_date=_d(2026, 8, 10), recommendation_id=None,
            product="Oberon", active_ingredient1="Spiromesifen",
            active_ingredient2=None, who_class="U", rac_code="23",
            rate="50/100L", qty=1, buying_price=1.0, cost_of_chemical=1.0,
            phi_days=3, safe_harvest_date=_d(2026, 8, 14), rei="12", comments=None,
            target1=None, target2=None,
        )
        base.update(over)
        return SimpleNamespace(**base)

    before = spray_program_content([rec()])
    after = spray_program_content([rec(scout_report_end_date=_d(2026, 8, 20))])
    assert before != after, "the scouting window must be inside the signed content"
