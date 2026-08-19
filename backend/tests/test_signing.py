"""The content hash is what makes a signature mean anything.

If it changes when it shouldn't, the portal cries tamper at an untouched sheet
and people learn to ignore the warning. If it fails to change when the dose or
the chemical moves, a signature vouches for something the signer never saw.
Both failures are worse than having no hash, so they are pinned here.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from app.services.signing import (
    HASH_VERSION,
    content_hash,
    hash_spray_program,
    spray_program_content,
)


def _record(**overrides):
    """A spray row with the fields the hash reads."""
    base = dict(
        program_id="prog-1",
        greenhouse_id=7,
        bed_code="Bed 4",
        partition_no="3",
        variety_code="SOLF",
        type_of_application="Drench",
        coverage="Full Cover",
        volume_of_water="1000 L",
        area_ha=0.992,
        start_date=date(2026, 8, 10),
        start_time="07:00",
        scout_report_date=date(2026, 8, 10),
        scout_report_end_date=date(2026, 8, 10),
        recommendation_id=None,
        product="Oberon",
        active_ingredient1="Spiromesifen",
        active_ingredient2=None,
        who_class="U",
        rac_code="23",
        rate="100/100L",
        qty=1,
        buying_price=4200,
        cost_of_chemical=4200,
        phi_days=3,
        rei="12",
        safe_harvest_date=date(2026, 8, 13),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── stability: the same program must always hash the same ───────────────────
def test_same_program_hashes_the_same():
    a = [_record(), _record(product="Benevia", cost_of_chemical=2600)]
    b = [_record(), _record(product="Benevia", cost_of_chemical=2600)]
    assert hash_spray_program(a) == hash_spray_program(b)


def test_product_order_does_not_change_the_hash():
    # The database is free to return the same three products in any order; a
    # false tamper alarm would be worse than none.
    one = _record(product="Oberon")
    two = _record(product="Benevia", cost_of_chemical=2600)
    three = _record(product="Ortiva", cost_of_chemical=104)
    assert hash_spray_program([one, two, three]) == hash_spray_program([three, one, two])


def test_numeric_forms_of_the_same_dose_agree():
    # 1, 1.0 and "1.00" are the same quantity and must not hash differently.
    assert hash_spray_program([_record(qty=1)]) == hash_spray_program([_record(qty=1.0)])
    assert hash_spray_program([_record(qty=0.5)]) == hash_spray_program(
        [_record(qty=0.50)]
    )


def test_dates_compare_by_day_not_by_representation():
    assert hash_spray_program([_record(start_date=date(2026, 8, 10))]) == (
        hash_spray_program([_record(start_date="2026-08-10")])
    )


# ── sensitivity: anything material must move the hash ───────────────────────
def _differs(**overrides) -> bool:
    return hash_spray_program([_record()]) != hash_spray_program([_record(**overrides)])


def test_changing_the_chemical_changes_the_hash():
    assert _differs(product="Switch")
    assert _differs(active_ingredient1="Cyprodinil")


def test_changing_the_dose_or_cost_changes_the_hash():
    assert _differs(rate="50/100L")
    assert _differs(qty=2)
    assert _differs(cost_of_chemical=9999)
    assert _differs(buying_price=5000)


def test_changing_the_block_changes_the_hash():
    assert _differs(greenhouse_id=8)
    assert _differs(bed_code="Bed 5")


def test_changing_a_safety_interval_changes_the_hash():
    assert _differs(phi_days=7)
    assert _differs(rei="24")
    assert _differs(safe_harvest_date=date(2026, 8, 20))


def test_removing_a_product_changes_the_hash():
    two = [_record(), _record(product="Benevia", cost_of_chemical=2600)]
    assert hash_spray_program(two) != hash_spray_program(two[:1])


# ── scope: things that do not change what went on the crop ──────────────────
def test_a_comment_added_later_is_not_tampering():
    # Flagging a typed note as tampering trains people to ignore the warning.
    # Nothing here alters the chemical, the dose, the block or the intervals.
    content = spray_program_content([_record()])
    assert "comments" not in content
    assert "program_status" not in content


def test_the_hash_covers_the_total_so_a_silent_reprice_shows():
    one = spray_program_content([_record()])
    assert one["total_cost"] == "4200.0000"


# ── shape ───────────────────────────────────────────────────────────────────
def test_hash_is_a_sha256_hex_digest():
    h = hash_spray_program([_record()])
    assert len(h) == 64
    assert all(c in "0123456789abcdef" for c in h)


def test_version_travels_with_the_content():
    # So a signature taken under an older canonical shape can be reported as
    # "signed under an earlier format" rather than silently as tampered.
    assert spray_program_content([_record()])["version"] == HASH_VERSION
    assert content_hash({"version": 1}) != content_hash({"version": 2})


def test_empty_program_does_not_explode():
    assert len(hash_spray_program([])) == 64
