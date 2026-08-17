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
    is_acid: bool


class _Tank(Protocol):
    code: str
    volume_l: float
    sets: float
    sets_mode: str
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


def is_acid_tank(tank: _Tank) -> bool:
    """Is this tank dosed at the acid rate?

    Decided by what is in it, not by what it is called. The supplied sheet
    happens to put acids in "Tank C", but a farm with two acid tanks, or one
    that letters them differently, must still get the right rate.
    """
    return any(getattr(line, "is_acid", False) for line in tank.lines)


def implied_sets(tank: _Tank, stock_l: float, acid_l: float) -> float:
    """The set count the water volume calls for, at this tank's own volume."""
    return sets_for(acid_l if is_acid_tank(tank) else stock_l, tank.volume_l)


def effective_sets(tank: _Tank, stock_l: float, acid_l: float) -> float:
    """The set count actually in force — the one costing must use.

    Two numbers that should agree is how a sheet ends up lying: the operator
    types 1, the water volume implies 5, and the cost silently follows the
    typed figure. So the derived value governs unless somebody has explicitly
    said otherwise, and the sheet shows both when they differ.
    """
    if getattr(tank, "sets_mode", "auto") == "manual":
        return max(float(tank.sets or 0), 0.0)
    derived = implied_sets(tank, stock_l, acid_l)
    # Nothing to derive from yet — fall back to whatever is on the record so a
    # part-filled draft still costs something sensible.
    return derived if derived > 0 else max(float(tank.sets or 0), 0.0)


def line_cost(quantity: float, sets: float, unit_price: float | None) -> float | None:
    """What one fertiliser costs across every set made up.

    The recipe is written per tank, so a sheet for five sets uses five times
    the quantity on the line — costing the line as written would understate
    the issue by a factor of the set count.
    """
    if unit_price is None:
        return None
    return round(quantity * max(sets, 0) * unit_price, 2)


def tank_cost(tank: _Tank, sets: float | None = None) -> float:
    """What this tank costs across the sets actually being made up."""
    n = tank.sets if sets is None else sets
    total = 0.0
    for line in tank.lines:
        c = line_cost(line.quantity, n, line.unit_price)
        if c:
            total += c
    return round(total, 2)


def total_cost(tanks: Iterable[_Tank], stock_l: float = 0.0, acid_l: float = 0.0) -> float:
    return round(
        sum(tank_cost(t, effective_sets(t, stock_l, acid_l)) for t in tanks), 2
    )


def sources_total_m3(sources: Iterable) -> float:
    """Water accounted for by the recorded sources."""
    return round(sum(float(getattr(s, "volume_m3", 0) or 0) for s in sources), 2)


def source_mismatch(volume_m3: float | None, sources: Iterable) -> str | None:
    """Does the source breakdown add up to the water that went on?

    Not an error — a farm may record only the borehole and leave the rest — but
    a silent difference between "835 m³ applied" and sources totalling 500 is
    exactly the sort of thing nobody notices until an audit.
    """
    listed = list(sources)
    if not volume_m3 or not listed:
        return None
    total = sources_total_m3(listed)
    if total <= 0:
        return None
    diff = round(total - volume_m3, 2)
    if abs(diff) < 0.5:  # rounding on a meter, not a discrepancy
        return None
    return (
        f"Water sources total {total} m³ against {volume_m3} m³ applied "
        f"({'+' if diff > 0 else ''}{diff} m³)."
    )


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
