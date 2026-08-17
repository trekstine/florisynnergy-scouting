"""The arithmetic on a fertigation sheet.

All of it derives from one number — cubic metres of irrigation water — through
rates the farm sets. Kept in one place so the builder, the list, the document
and any later report cannot drift apart on what a figure means.

From the source report:

    1 set = 1,000 L · fertiliser injection 6 L/m³ · acid injection 2 L/m³
    6 sets = 6,000 L over ~30 ha → 200 L/ha → 200 ÷ 6 ≈ 33.33 m³/ha

Rates and tank volumes are configurable and stored on each record, because the
supplied documents already disagree with each other — 132 kg of CaNO3 in the
report against 145 kg in the printed regime, 30 ha against 32 ha. A sheet has
to keep saying what it said when it was signed.
"""
from __future__ import annotations

from typing import Iterable, Protocol


class _Line(Protocol):
    quantity: float
    unit_price: float | None


class _Tank(Protocol):
    volume_l: float
    sets: float
    lines: list


def stock_required_l(volume_m3: float | None, rate_l_m3: float) -> float:
    """Litres of stock solution the injection rate calls for."""
    if not volume_m3 or rate_l_m3 <= 0:
        return 0.0
    return round(volume_m3 * rate_l_m3, 2)


def sets_for(stock_l: float, tank_volume_l: float) -> float:
    """How many tank-fulls that is.

    Returned as a decimal rather than rounded up: the operator confirms the
    approved set count, and quietly rounding 5.2 to 6 would overstate the
    material issued by most of a tank.
    """
    if tank_volume_l <= 0:
        return 0.0
    return round(stock_l / tank_volume_l, 3)


def line_cost(quantity: float, sets: float, unit_price: float | None) -> float | None:
    """What one fertiliser costs across every set made up.

    The recipe is written per tank, so a sheet for five sets uses five times
    the quantity on the line — costing the line as written would understate
    the issue by a factor of the set count.
    """
    if unit_price is None:
        return None
    return round(quantity * max(sets, 0) * unit_price, 2)


def tank_cost(tank: _Tank) -> float:
    total = 0.0
    for line in tank.lines:
        c = line_cost(line.quantity, tank.sets, line.unit_price)
        if c:
            total += c
    return round(total, 2)


def total_cost(tanks: Iterable[_Tank]) -> float:
    return round(sum(tank_cost(t) for t in tanks), 2)


def m3_per_ha(volume_m3: float | None, area_ha: float | None) -> float | None:
    """The figure the farm actually compares between days."""
    if not volume_m3 or not area_ha:
        return None
    return round(volume_m3 / area_ha, 2)


def tank_warnings(tanks: Iterable[_Tank]) -> list[str]:
    """Chemistry the sheet should not get wrong.

    Calcium must not share a tank with sulphate or phosphate: calcium sulphate
    and calcium phosphate are barely soluble and will drop out as a sludge that
    blocks the drippers. That separation is the reason stock tanks are split
    A/B in the first place, so the software should say so rather than let
    somebody discover it at the emitters.
    """
    warnings: list[str] = []
    for tank in tanks:
        codes = {
            (getattr(line, "fertiliser_code", "") or "").upper().replace(" ", "")
            for line in tank.lines
            if getattr(line, "quantity", 0)
        }
        calcium = {c for c in codes if "CA" in c and not c.startswith("CU")}
        precipitating = {c for c in codes if "SO4" in c or "PO4" in c or "MKP" in c}
        if calcium and precipitating:
            warnings.append(
                f"Tank {tank.code}: {', '.join(sorted(calcium))} with "
                f"{', '.join(sorted(precipitating))} — calcium with sulphate or "
                "phosphate precipitates and will block the drippers. These "
                "normally go in separate tanks."
            )
    return warnings
