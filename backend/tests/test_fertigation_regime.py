"""The Fertigation Report, held to.

Two different things live in that document and they must not be confused:

* the **regime** — the injection rates, the tank volumes, the quantity of each
  salt per tank-full. Fixed, and worth pinning here so a transcription slip
  shows up as a failing test rather than as a wrong weight at the store.
* the **worked example** — "6 sets over roughly 30 ha ≈ 33.33 m³/ha". An
  illustration of one day. The report says so itself: *there is no predefined
  number of sets (this is the volume used, can be 5 or 6)*. Nothing may treat
  33.33, 6 sets or 30 ha as a constant.

The tests below check both: that the fixed parts are transcribed correctly, and
that the illustrative parts are genuinely derived rather than assumed.
"""
from __future__ import annotations

import pytest

from app.fertigation_regime import REGIME
from app.services import fertigation as calc

V1 = "/api/v1"


class _Line:
    def __init__(self, code, quantity, price=None, acid=False):
        self.fertiliser_code = code
        self.quantity = quantity
        self.unit_price = price
        self.is_acid = acid


class _Tank:
    def __init__(self, code, volume_l, lines, sets=1.0, mode="auto"):
        self.code = code
        self.volume_l = volume_l
        self.lines = lines
        self.sets = sets
        self.sets_mode = mode


# ── the regime, as transcribed ───────────────────────────────────────────────
def test_tank_volumes_match_the_report():
    volumes = {code: volume for code, volume, _ in REGIME}
    assert volumes == {"A": 1000.0, "B": 1000.0, "C": 500.0}


def test_tank_a_composition():
    lines = dict(next(l for c, _, l in REGIME if c == "A"))
    assert lines == {"CANO3": 132.0, "KNO3": 38.0, "FE": 5.9, "SUPERLINK": 1.0}


def test_tank_b_composition():
    lines = dict(next(l for c, _, l in REGIME if c == "B"))
    assert lines == {
        "MGSO4": 74.0, "MGNO3": 8.8, "MKP": 44.0, "KNO3": 36.0,
        "NA2MO2": 0.22, "CUSO4": 0.22, "ZNSO4": 0.31, "BORAX": 0.37,
        "MNSO4": 0.79,
    }


def test_tank_c_composition():
    lines = dict(next(l for c, _, l in REGIME if c == "C"))
    assert lines == {"H2SO4": 24.0, "H3PO4": 5.8}


def test_potassium_nitrate_is_in_two_tanks_at_different_rates():
    """Not a transcription error — the sheet really does dose KNO3 twice."""
    a = dict(next(l for c, _, l in REGIME if c == "A"))
    b = dict(next(l for c, _, l in REGIME if c == "B"))
    assert a["KNO3"] == 38.0
    assert b["KNO3"] == 36.0


# ── the report's chain, followed exactly ─────────────────────────────────────
#
#     1 set = 1,000 litres
#     6 sets = 6,000 litres
#     Total Roses Area (GH1–GH10) ≈ 30 hectares
#     Per hectare = 6,000 litres / 30 ha = 200 litres/ha
#     Machine Pump Rate = 6 litres/m³  (fixed)
#     Hence: m³ per ha = 200 / 6 ≈ 33.33 m³/ha
#     m³ used = 33.33 × (Greenhouse Area in ha)
#
# The litres are the input. The water is derived from them by the pump rate —
# not by 1,000. That confusion put the water out by a factor of 167.

SOLUTION_L = 6000.0   # what the operator keys in
AREA_HA = 30.0
PUMP = 6.0            # litres of solution per m³ of water — fixed
ACID = 2.0            # litres of acid per m³ of water — fixed


def test_sets_are_the_litres_over_the_tank_volume():
    """"1 set = 1,000 litres; 6 sets = 6,000 litres"."""
    assert calc.sets_for(SOLUTION_L, 1000.0) == 6.0
    assert calc.sets_for(1000.0, 1000.0) == 1.0


def test_litres_per_hectare():
    """"Per hectare = 6,000 litres / 30 ha = 200 litres/ha"."""
    assert calc.l_per_ha(SOLUTION_L, AREA_HA) == 200.0


def test_cubic_metres_per_hectare():
    """"m³ per ha = 200 / 6 ≈ 33.33 m³/ha".

    Litres per hectare divided by the pump rate. This is the only conversion
    between the two units on the sheet.
    """
    assert calc.m3_per_ha(SOLUTION_L, AREA_HA, PUMP) == 33.33


def test_water_is_derived_from_the_litres_by_the_pump_rate():
    """6,000 L at 6 L/m³ is 1,000 m³ of water — not 6 m³.

    Dividing litres by 1,000 is a plain volume conversion and has no place in
    this chain; the pump rate is what relates the two.
    """
    assert calc.water_m3(SOLUTION_L, PUMP) == 1000.0
    # And it agrees with m³/ha × area, which is the same fact stated twice.
    assert calc.water_m3(SOLUTION_L, PUMP) == pytest.approx(
        calc.m3_per_ha(SOLUTION_L, AREA_HA, PUMP) * AREA_HA, abs=1.0
    )


def test_cubic_metres_used_by_one_greenhouse():
    """"m³ used = 33.33 × (Greenhouse Area in ha)"."""
    rate = calc.m3_per_ha(SOLUTION_L, AREA_HA, PUMP)
    assert calc.block_m3(rate, 3.0) == round(33.33 * 3.0, 2)
    # The blocks fed must add back up to the water the litres imply.
    assert calc.block_m3(rate, AREA_HA) == pytest.approx(1000.0, abs=1.0)


def test_acid_follows_the_water_not_the_litres():
    """"Sarai valves take in 6 litres/m³ of fertilizer and 2 litres/m³ of acid."

    Both rates are per cubic metre of water, so the acid is two litres for each
    of the thousand cubic metres — 2,000 L.
    """
    assert calc.acid_required_l(SOLUTION_L, PUMP, ACID) == 2000.0


def test_the_reports_issue_example():
    """"132 × 6 = 792 kg of CaNO3 for the full cycle"."""
    tank = _Tank("A", 1000.0, [_Line("CANO3", 132.0, price=1.0)])
    sets = calc.effective_sets(tank, SOLUTION_L, 0.0)
    assert sets == 6.0
    assert calc.line_issue(132.0, sets) == 792.0
    # With a unit price of 1 the cost is the weight, which is the same sum.
    assert calc.tank_cost(tank, sets) == 792.0


@pytest.mark.parametrize("sets_wanted", [5, 6, 7.5])
def test_the_set_count_is_whatever_the_litres_say(sets_wanted):
    """"There is no predefined number of sets (this is the volume used)."

    Five is as legitimate as six, and a fraction is legitimate too — the litres
    are keyed in, not chosen from a list.
    """
    litres = sets_wanted * 1000.0
    tank = _Tank("A", 1000.0, [_Line("CANO3", 132.0)])
    assert calc.implied_sets(tank, litres, 0.0) == pytest.approx(sets_wanted, abs=0.01)


def test_the_acid_tank_does_not_scale_with_the_others():
    """Each tank's recipe is per its own volume — A and B 1,000 L, C 500 L.

    6,000 L of solution and 2,000 L of acid is six make-ups of A and B and four
    of C, not six.
    """
    acid_l = calc.acid_required_l(SOLUTION_L, PUMP, ACID)
    a = _Tank("A", 1000.0, [_Line("CANO3", 132.0)])
    c = _Tank("C", 500.0, [_Line("H2SO4", 24.0, acid=True)])
    assert calc.implied_sets(a, SOLUTION_L, acid_l) == 6.0
    assert calc.implied_sets(c, SOLUTION_L, acid_l) == 4.0


def test_nothing_is_assumed_when_a_figure_is_missing():
    """Rather than dividing by zero and reporting a rate of infinity."""
    assert calc.l_per_ha(SOLUTION_L, 0) is None
    assert calc.l_per_ha(SOLUTION_L, None) is None
    assert calc.m3_per_ha(None, AREA_HA, PUMP) is None
    assert calc.water_m3(None, PUMP) is None
    assert calc.block_m3(None, 3.0) is None
    assert calc.acid_required_l(None, PUMP, ACID) == 0.0


def test_the_pump_rate_is_never_confused_with_a_thousand():
    """The regression that made this rewrite necessary.

    Treating the keyed litres as water and converting by 1,000 gave 6 m³ where
    the document gives 1,000 — out by 167×. Pinned so it cannot come back.
    """
    assert calc.water_m3(6000.0, PUMP) == 1000.0
    assert calc.water_m3(6000.0, PUMP) != 6.0


# ── the endpoint that hands the regime to the builder ────────────────────────
@pytest.mark.asyncio(loop_scope="session")
async def test_regime_endpoint_resolves_against_the_register(client, auth):
    rows = (await client.get(f"{V1}/fertigation/regime", headers=auth)).json()
    assert [t["code"] for t in rows] == ["A", "B", "C"]
    assert [t["volume_l"] for t in rows] == [1000.0, 1000.0, 500.0]

    # Every line must carry a real fertiliser id, or the builder would show a
    # row that cannot be costed.
    for tank in rows:
        assert tank["lines"], f"tank {tank['code']} came back empty"
        for line in tank["lines"]:
            assert line["fertiliser_id"] is not None, line
            assert line["quantity"] > 0

    # And the set count is never pre-set: it is derived from the day's water.
    assert all(t["sets_mode"] == "auto" for t in rows)


@pytest.mark.asyncio(loop_scope="session")
async def test_regime_quantities_survive_the_round_trip(client, auth):
    rows = (await client.get(f"{V1}/fertigation/regime", headers=auth)).json()
    by_code = {t["code"]: {l["fertiliser_code"]: l["quantity"] for l in t["lines"]} for t in rows}
    assert by_code["A"]["CANO3"] == 132.0
    assert by_code["C"]["H2SO4"] == 24.0
    assert by_code["B"]["MNSO4"] == 0.79


# ── sheets raised before the units were corrected ────────────────────────────
@pytest.mark.asyncio(loop_scope="session")
async def test_backfill_leaves_every_figure_on_a_sheet_unchanged(client, auth):
    """Re-expressing an old sheet in litres must not restate it.

    The old model keyed the water and derived the solution by × pump rate; the
    new one keys the solution and derives the water by ÷ pump rate. So setting
    `solution_l = old volume_m3 × pump` returns the same water, the same set
    counts, the same issue weights and the same cost. It is a change of
    variable, not of meaning — and this proves it on a real row rather than
    asserting it.
    """
    from sqlalchemy import update

    from app.database import AsyncSessionLocal
    from app.models import Fertigation
    from app.seed import backfill_fertigation_litres

    # A sheet as it stands today.
    body = await _fertigation_payload_for(client, auth)
    body["solution_l"] = 6000
    body["area_ha"] = 30
    created = (await client.post(f"{V1}/fertigation", json=body, headers=auth)).json()
    doc_id = created["doc_id"]
    before = {
        k: created[k]
        for k in ("volume_m3", "l_per_ha", "m3_per_ha", "acid_required_l", "total_cost")
    }
    sets_before = [t["effective_sets"] for t in created["tanks"]]

    # Wind it back to how an old row looked: water recorded, litres absent.
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Fertigation)
            .where(Fertigation.doc_id == doc_id)
            .values(solution_l=None, l_per_ha=None, target_m3_per_ha=None)
        )
        await db.commit()

        filled = await backfill_fertigation_litres(db)
        assert filled >= 1

    after = (await client.get(f"{V1}/fertigation/{doc_id}", headers=auth)).json()
    assert after["solution_l"] == 6000.0
    for key, value in before.items():
        assert after[key] == value, f"{key} changed: {value} → {after[key]}"
    assert [t["effective_sets"] for t in after["tanks"]] == sets_before

    await client.delete(f"{V1}/fertigation/{doc_id}", headers=auth)


@pytest.mark.asyncio(loop_scope="session")
async def test_backfill_is_idempotent(client, auth):
    """Booting twice must not double anything."""
    from app.database import AsyncSessionLocal
    from app.seed import backfill_fertigation_litres

    async with AsyncSessionLocal() as db:
        first = await backfill_fertigation_litres(db)
        second = await backfill_fertigation_litres(db)
    assert second == 0, f"second pass touched {second} rows"
    assert first >= 0


async def _fertigation_payload_for(client, auth):
    ferts = (await client.get(f"{V1}/fertigation/fertilisers", headers=auth)).json()
    from datetime import date as _date

    return {
        "activity": "fertigation",
        "event_date": _date.today().isoformat(),
        "blocks": [{"greenhouse_id": 1}],
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
                        "quantity": 132,
                        "unit": ferts[0]["unit"],
                        "position": 0,
                    }
                ],
            }
        ],
        "sources": [],
    }
