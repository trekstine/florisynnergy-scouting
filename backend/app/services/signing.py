"""What was signed, and how we prove it later.

A signature over a document that can still change afterwards proves nothing.
So at the moment of signing we take a canonical view of the content that
actually matters — the block, the date, the tank mix, the dose, the cost, the
intervals — serialise it deterministically and hash it. Recomputing that hash
later answers one question honestly: does this sheet still say what the signer
agreed to?

Two deliberate choices:

* **Only material content.** A comment typed after approval does not change
  what was authorised onto the crop, and flagging it as tampering would train
  people to ignore the warning. Fields that alter the chemical, the dose, the
  cost, the block or the safety intervals are in; everything else is out.
* **Order-independent.** Products are sorted before hashing, because the
  database is free to return the same three products in a different order and
  a false tamper alarm is worse than no alarm at all.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

from ..models import SprayRecord

# Bumped when the canonical shape changes, so an old signature is reported as
# "signed under an earlier format" rather than silently as tampered.
HASH_VERSION = 1


def _num(value: Any) -> str | None:
    """Numbers as fixed-precision strings — 1, 1.0 and Decimal('1.00') are
    the same dose, and must not hash differently."""
    if value is None:
        return None
    try:
        return f"{float(value):.4f}"
    except (TypeError, ValueError):
        return str(value)


def _date(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)[:10]


def spray_program_content(records: list[SprayRecord]) -> dict[str, Any]:
    """The signable content of a spray program.

    Everything here changes what goes on the crop, what it costs, or when the
    block can be re-entered and cut.
    """
    if not records:
        return {"version": HASH_VERSION, "products": []}

    head = records[0]
    products = sorted(
        (
            {
                "product": r.product,
                "active_ingredient1": r.active_ingredient1,
                "active_ingredient2": r.active_ingredient2,
                "who_class": r.who_class,
                "rac_code": r.rac_code,
                "rate": r.rate,
                "qty": _num(r.qty),
                "buying_price": _num(r.buying_price),
                "cost": _num(r.cost_of_chemical),
                "phi_days": r.phi_days,
                "rei": r.rei,
                "safe_harvest_date": _date(r.safe_harvest_date),
            }
            for r in records
        ),
        # Sorted on the content itself, not on a database id, so the same
        # program hashes the same however the rows come back.
        key=lambda p: json.dumps(p, sort_keys=True, default=str),
    )

    return {
        "version": HASH_VERSION,
        "program_id": head.program_id,
        "greenhouse_id": head.greenhouse_id,
        "bed_code": head.bed_code,
        "partition_no": head.partition_no,
        "variety_code": head.variety_code,
        "type_of_application": head.type_of_application,
        "coverage": head.coverage,
        "volume_of_water": head.volume_of_water,
        "area_ha": _num(head.area_ha),
        "start_date": _date(head.start_date),
        "start_time": head.start_time,
        "scout_report_date": _date(head.scout_report_date),
        "recommendation_id": head.recommendation_id,
        "total_cost": _num(sum(float(r.cost_of_chemical or 0) for r in records)),
        "products": products,
    }


def content_hash(content: dict[str, Any]) -> str:
    """A stable SHA-256 over the canonical content."""
    canonical = json.dumps(
        content, sort_keys=True, separators=(",", ":"), default=str, ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def hash_spray_program(records: list[SprayRecord]) -> str:
    return content_hash(spray_program_content(records))
