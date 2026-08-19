"""The arithmetic on a fertigation sheet, exactly as the Fertigation Report gives it.

Nothing here is derived from anywhere else. The report's own chain, in its own
order, is the whole of it:

    1 set = 1,000 litres
    6 sets = 6,000 litres
    Total Roses Area (GH1–GH10) ≈ 30 hectares
    Per hectare = 6,000 litres / 30 ha = 200 litres/ha
    Machine Pump Rate = 6 litres/m³   (fixed)
    Hence: m³ per ha = 200 / 6 ≈ 33.33 m³/ha
    m³ used = 33.33 × (Greenhouse Area in ha)

Read that carefully, because it is easy to get backwards and I did:

**The litres are the input.** The operator keys in the litres of solution made
up — the sets. 6,000 L is six sets. The irrigation water is *derived* from it,
by dividing by the pump rate. Water is an output, not something anyone types.

**The pump rate converts litres to cubic metres.** 6 L/m³ means six litres of
solution go out with every cubic metre of water, so ``water m³ = litres ÷ 6``.
It is emphatically not 1,000 — dividing litres by 1,000 is a volume conversion
and has no place in this chain. That mistake put the water out by a factor of
167.

So:

    litres keyed in
      ├─ sets      = litres ÷ tank volume        (1,000 L for A and B, 500 for C)
      ├─ L/ha      = litres ÷ area fed
      ├─ m³/ha     = (L/ha) ÷ pump rate
      ├─ water m³  = m³/ha × area fed
      ├─ per block = m³/ha × that block's area   ("m³ used = 33.33 × area")
      └─ acid L    = acid rate × water m³        (2 L/m³ at the sarai valve)

The 6,000 L, the 30 ha and the 33.33 m³/ha in the report are one day's worked
example, not constants. The report says so itself: *there is no predefined
number of sets (this is the volume used, can be 5 or 6)*. The pump rate and the
acid rate are the fixed parts.

Rates and tank volumes are stored on each record even though they are fixed
today, because a signed sheet has to keep saying what it said.
"""
from __future__ import annotations

from typing import Iterable, Protocol

# The report's fixed figures, used as defaults only.
PUMP_RATE_L_PER_M3 = 6.0
ACID_RATE_L_PER_M3 = 2.0


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


# ── the chain, in the report's order ─────────────────────────────────────────
def sets_for(solution_l: float | None, tank_volume_l: float) -> float:
    """How many tank-fulls the litres make up.

    "1 set = 1,000 litres" — so six thousand litres is six sets of a 1,000 L
    tank, and four of a 500 L one.

    Decimal rather than rounded up: the report is explicit that the count is
    "the volume used, can be 5 or 6", so 5.2 is a real answer and rounding it
    to 6 would overstate what leaves the store by most of a tank.
    """
    if not solution_l or tank_volume_l <= 0:
        return 0.0
    return round(solution_l / tank_volume_l, 3)


def l_per_ha(solution_l: float | None, area_ha: float | None) -> float | None:
    """"Per hectare = 6,000 litres / 30 ha = 200 litres/ha"."""
    if not solution_l or not area_ha or area_ha <= 0:
        return None
    return round(solution_l / area_ha, 2)


def m3_per_ha(
    solution_l: float | None,
    area_ha: float | None,
    pump_rate_l_m3: float = PUMP_RATE_L_PER_M3,
) -> float | None:
    """"m³ per ha = 200 / 6 ≈ 33.33 m³/ha".

    The litres per hectare divided by the pump rate. This is the figure the
    report illustrates as 33.33 — an outcome of that day's volume and area, not
    a target and not a default.
    """
    per_ha = l_per_ha(solution_l, area_ha)
    if per_ha is None or pump_rate_l_m3 <= 0:
        return None
    return round(per_ha / pump_rate_l_m3, 2)


def water_m3(
    solution_l: float | None,
    pump_rate_l_m3: float = PUMP_RATE_L_PER_M3,
) -> float | None:
    """The irrigation water the pump rate implies.

    Equivalent to ``m³/ha × area``, and stated separately because it is the
    figure the meters are read against. Six litres of solution per cubic metre
    of water means a thousand cubic metres carried the six thousand litres.
    """
    if not solution_l or pump_rate_l_m3 <= 0:
        return None
    return round(solution_l / pump_rate_l_m3, 2)


def block_m3(m3_per_hectare: float | None, block_area_ha: float | None) -> float | None:
    """"To calculate the cubic meters used for a specific greenhouse:
    m³ used = 33.33 × (Greenhouse Area in ha)"."""
    if m3_per_hectare is None or not block_area_ha or block_area_ha <= 0:
        return None
    return round(m3_per_hectare * block_area_ha, 2)


def acid_required_l(
    solution_l: float | None,
    pump_rate_l_m3: float = PUMP_RATE_L_PER_M3,
    acid_rate_l_m3: float = ACID_RATE_L_PER_M3,
) -> float:
    """"Sarai valves take in 6 litres/m³ of fertilizer and 2 litres/m³ of acid."

    Acid is dosed against the *water*, like the fertiliser is — so it follows
    the water the fertiliser litres imply.
    """
    water = water_m3(solution_l, pump_rate_l_m3)
    if water is None or acid_rate_l_m3 <= 0:
        return 0.0
    return round(water * acid_rate_l_m3, 2)


# ── tanks ────────────────────────────────────────────────────────────────────
def is_acid_tank(tank: _Tank) -> bool:
    """Is this tank made up at the acid rate?

    Decided by what is in it, not by what it is called. The report puts acids
    in "Tank C", but a farm with two acid tanks, or one that letters them
    differently, must still get the right figure.
    """
    return any(getattr(line, "is_acid", False) for line in tank.lines)


def implied_sets(tank: _Tank, solution_l: float, acid_l: float) -> float:
    """Tank-fulls this tank makes up, at its own volume.

    A and B are made up in 1,000 L and C in 500 L, and each tank's recipe is
    written per its own volume — so a day of 6,000 L of fertiliser solution and
    2,000 L of acid is six make-ups of A and B and four of C.
    """
    return sets_for(acid_l if is_acid_tank(tank) else solution_l, tank.volume_l)


def effective_sets(tank: _Tank, solution_l: float, acid_l: float) -> float:
    """The count actually in force — the one costing must use.

    Two numbers that should agree is how a sheet ends up lying: the operator
    types 1, the litres imply 6, and the cost silently follows the typed
    figure. The derived value governs unless somebody has explicitly overridden
    it, and the sheet shows both when they differ.
    """
    if getattr(tank, "sets_mode", "auto") == "manual":
        return max(float(tank.sets or 0), 0.0)
    derived = implied_sets(tank, solution_l, acid_l)
    # Nothing to derive from yet — fall back to what is on the record so a
    # part-filled draft still costs something sensible.
    return derived if derived > 0 else max(float(tank.sets or 0), 0.0)


def line_cost(quantity: float, sets: float, unit_price: float | None) -> float | None:
    """What one fertiliser costs across every tank-full made up.

    "Defined Rate per Set (1,000 litres) for CANO₃ = 132 kg. For 6 sets:
    132 × 6 = 792 kg." Costing the line as written would understate the issue
    by a factor of the set count.
    """
    if unit_price is None:
        return None
    return round(quantity * max(sets, 0) * unit_price, 2)


def line_issue(quantity: float, sets: float) -> float:
    """The weight or volume the store actually issues — recipe × tank-fulls."""
    return round(quantity * max(sets, 0), 3)


def tank_cost(tank: _Tank, sets: float | None = None) -> float:
    n = tank.sets if sets is None else sets
    total = 0.0
    for line in tank.lines:
        c = line_cost(line.quantity, n, line.unit_price)
        if c:
            total += c
    return round(total, 2)


def total_cost(
    tanks: Iterable[_Tank], solution_l: float = 0.0, acid_l: float = 0.0
) -> float:
    return round(
        sum(tank_cost(t, effective_sets(t, solution_l, acid_l)) for t in tanks), 2
    )


# ── the blocks fed ───────────────────────────────────────────────────────────
def selected_area_ha(blocks: Iterable) -> float:
    """The area a fertigation covered — the sum over the blocks fed.

    Not one block's hectares. A phase fed as one event covers every greenhouse
    on it, and dividing by a single block's area would overstate L/ha and
    m³/ha several times over.
    """
    total = sum(float(getattr(b, "area_ha", 0) or 0) for b in blocks)
    return round(total, 4)


def blocks_total_m3(blocks: Iterable) -> float:
    """Water metered to individual blocks, where the farm records it."""
    return round(sum(float(getattr(b, "volume_m3", 0) or 0) for b in blocks), 2)


def block_mismatch(total_water_m3: float | None, blocks: Iterable) -> str | None:
    """Do the per-block figures add up to the water the litres imply?"""
    listed = [b for b in blocks if getattr(b, "volume_m3", None)]
    if not total_water_m3 or not listed:
        return None
    total = blocks_total_m3(listed)
    diff = round(total - total_water_m3, 2)
    if abs(diff) < 0.5:
        return None
    return (
        f"Per-greenhouse volumes total {total} m³ against {total_water_m3} m³ "
        f"implied by the litres made up ({'+' if diff > 0 else ''}{diff} m³)."
    )


# ── water sources ────────────────────────────────────────────────────────────
def sources_total_m3(sources: Iterable) -> float:
    return round(sum(float(getattr(s, "volume_m3", 0) or 0) for s in sources), 2)


def source_mismatch(total_water_m3: float | None, sources: Iterable) -> str | None:
    """Does the source breakdown add up to the water that went on?

    Not an error — a farm may record only the borehole and leave the rest — but
    the report asks for river, borehole and reservoir-to-field to be recorded
    each day, so the two ought to agree, and a silent gap is exactly the sort
    of thing nobody notices until an audit.
    """
    listed = list(sources)
    if not total_water_m3 or not listed:
        return None
    total = sources_total_m3(listed)
    if total <= 0:
        return None
    diff = round(total - total_water_m3, 2)
    if abs(diff) < 0.5:  # rounding on a meter, not a discrepancy
        return None
    return (
        f"Water sources total {total} m³ against {total_water_m3} m³ implied "
        f"by the litres made up ({'+' if diff > 0 else ''}{diff} m³)."
    )


# ── chemistry ────────────────────────────────────────────────────────────────
def tank_warnings(tanks: Iterable[_Tank]) -> list[str]:
    """Chemistry the sheet should not get wrong.

    Calcium must not share a tank with sulphate or phosphate: calcium sulphate
    and calcium phosphate are barely soluble and will drop out as a sludge that
    blocks the drippers. That separation is why the report splits Tank A from
    Tank B in the first place, so the software should say so rather than let
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
