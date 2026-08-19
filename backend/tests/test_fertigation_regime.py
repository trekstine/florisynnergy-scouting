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


# ── the worked example, re-derived ───────────────────────────────────────────
def test_the_reports_worked_example_falls_out_of_the_arithmetic():
    """6 sets over ~30 ha ≈ 33.33 m³/ha — reproduced, never hard-coded.

    The report's chain runs: 6 sets = 6,000 L of stock; over 30 ha that is
    200 L/ha; at the sarai valve's 6 L/m³ that is 33.33 m³/ha. Ours runs the
    other way, from the metered water, and must land on the same numbers.
    """
    water_m3 = 1000.0            # what the meters would have shown that day
    stock_l = calc.stock_required_l(water_m3, 6)
    assert stock_l == 6000.0     # "6 sets = 6,000 litres"

    tank_a = _Tank("A", 1000.0, [_Line("CANO3", 132.0)])
    assert calc.implied_sets(tank_a, stock_l, 0.0) == 6.0

    area = 30.0
    assert round(stock_l / area, 2) == 200.0                       # 200 L/ha
    assert calc.applied_rate_m3_per_ha(water_m3, area) == 33.33    # ≈ 33.33


def test_the_reports_issue_example():
    """"132 × 6 = 792 kg of CaNO3 for the full cycle." """
    tank = _Tank("A", 1000.0, [_Line("CANO3", 132.0, price=1.0)])
    sets = calc.effective_sets(tank, 6000.0, 0.0)
    assert sets == 6.0
    # Cost is quantity × sets × price; with price 1 it *is* the weight issued.
    assert calc.tank_cost(tank, sets) == 792.0


@pytest.mark.parametrize("sets_wanted", [5, 6, 7.5])
def test_the_set_count_follows_the_water_and_nothing_else(sets_wanted):
    """"There is no predefined number of sets (this is the volume used)."

    Five sets is as legitimate as six, and a fractional count is legitimate
    too — the water is metered, not chosen from a list.
    """
    water_m3 = sets_wanted * 1000 / 6  # the volume that calls for that many
    stock_l = calc.stock_required_l(water_m3, 6)
    tank = _Tank("A", 1000.0, [_Line("CANO3", 132.0)])
    assert calc.implied_sets(tank, stock_l, 0.0) == pytest.approx(sets_wanted, abs=0.01)


def test_the_acid_tank_does_not_scale_with_the_others():
    """Each tank's recipe is per its own volume — A and B 1,000 L, C 500 L.

    So a day needing 6,000 L of stock and 2,000 L of acid is six make-ups of A
    and B but four of C, not six. This was an open question until the report
    settled it.
    """
    stock_l, acid_l = 6000.0, 2000.0
    a = _Tank("A", 1000.0, [_Line("CANO3", 132.0)])
    c = _Tank("C", 500.0, [_Line("H2SO4", 24.0, acid=True)])
    assert calc.implied_sets(a, stock_l, acid_l) == 6.0
    assert calc.implied_sets(c, stock_l, acid_l) == 4.0


def test_no_rate_is_assumed_when_there_is_no_area():
    """Rather than dividing by zero and reporting a feeding rate of infinity."""
    assert calc.applied_rate_m3_per_ha(1000.0, 0) is None
    assert calc.applied_rate_m3_per_ha(1000.0, None) is None
    assert calc.applied_rate_m3_per_ha(None, 30.0) is None


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
