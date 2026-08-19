"""The arithmetic on a fertigation sheet.

All of it derives from one measured number — the cubic metres of water that
went on, taken from the phase meter readings before and after — through rates
the farm sets. Kept in one place so the builder, the list, the document and any
later report cannot drift apart on what a figure means.

What the Fertigation Report actually fixes, and what it merely illustrates,
matters here and is easy to get backwards:

**Fixed by the regime**

    Sarai valves inject 6 L of fertiliser stock and 2 L of acid per m³ of water.
    A set is one make-up of a tank: Tanks A and B hold 1,000 L, Tank C 500 L.
    Each tank's recipe is written per its own volume — 132 kg CaNO₃ per 1,000 L
    of Tank A, 24 kg H₂SO₄ per 500 L of Tank C.

**Worked examples, not constants**

    The report walks through one day: 6 sets = 6,000 L of stock, over roughly
    30 ha, giving 200 L/ha, which at 6 L/m³ is about 33.33 m³/ha. Every figure
    in that sentence is an illustration. The report says so plainly a page
    later — "there is no predefined number of sets (this is the volume used,
    can be 5 or 6)" — and the areas differ between the two source documents
    anyway. So 33.33 is never a target and never a default; it is simply what
    that day's water came to per hectare, and it changes every time.

The direction of the calculation is therefore:

    water m³ (metered)  →  stock L = m³ × 6  →  sets = stock L ÷ tank volume
                        →  issue per fertiliser = recipe × sets
                        →  m³/ha = water ÷ area fed

Rates and tank volumes are configurable and stored on each record, because the
supplied documents already disagree with each other — 132 kg of CaNO₃ in the
report against 145 kg in the printed regime. A sheet has to keep saying what it
said when it was signed.
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
    a silent difference between the water applied and the sources it was drawn
    from is exactly the sort of thing nobody notices until an audit. The report
    asks for river, borehole and reservoir-to-field to be recorded each day, so
    the two ought to agree.
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


def selected_area_ha(blocks: Iterable) -> float:
    """BR-001 — the area a fertigation actually covered.

    The sum over the blocks selected, not a single block's hectares. A phase
    fed as one event covers every greenhouse on it, and dividing the water by
    one block's area would overstate m³/ha several times over.
    """
    total = sum(float(getattr(b, "area_ha", 0) or 0) for b in blocks)
    return round(total, 4)


def applied_rate_m3_per_ha(volume_m3: float | None, area_ha: float | None) -> float | None:
    """The rate the water actually came to, over the area it covered.

    This is the figure the report illustrates as "≈ 33.33 m³/ha". It is an
    outcome, not a target: the farm meters the water that went on and this is
    what it works out to per hectare, so it differs from day to day and from
    phase to phase. Nothing should default to it or measure against it.

    It replaces a typed field. Two editable numbers describing one fact is how
    a sheet ends up disagreeing with itself — the same fault the set count had,
    where a typed 1 sat beside a derived 6 and the costing followed the wrong
    one.

    Derived at write time and stored on the record, so a signed sheet keeps
    saying what it said even if a block is later re-measured.
    """
    if not volume_m3 or not area_ha or area_ha <= 0:
        return None
    return round(volume_m3 / area_ha, 2)


def blocks_total_m3(blocks: Iterable) -> float:
    """Water metered to individual blocks, where the farm records it."""
    return round(sum(float(getattr(b, "volume_m3", 0) or 0) for b in blocks), 2)


def block_mismatch(volume_m3: float | None, blocks: Iterable) -> str | None:
    """Do the per-block figures add up to the water that went on?"""
    listed = [b for b in blocks if getattr(b, "volume_m3", None)]
    if not volume_m3 or not listed:
        return None
    total = blocks_total_m3(listed)
    diff = round(total - volume_m3, 2)
    if abs(diff) < 0.5:
        return None
    return (
        f"Per-greenhouse volumes total {total} m³ against {volume_m3} m³ "
        f"applied ({'+' if diff > 0 else ''}{diff} m³)."
    )


def block_m3_per_ha(block, fallback_total_m3: float | None, total_area: float) -> float | None:
    """m³/ha for one block.

    Uses its own metered volume where there is one. Otherwise the phase total
    is apportioned by area, which is the assumption the farm makes when it
    quotes a single m³/ha for a whole phase.
    """
    area = float(getattr(block, "area_ha", 0) or 0)
    if area <= 0:
        return None
    own = getattr(block, "volume_m3", None)
    if own:
        return round(float(own) / area, 2)
    if fallback_total_m3 and total_area > 0:
        share = float(fallback_total_m3) * (area / total_area)
        return round(share / area, 2)
    return None


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
