"""Aggregates over raised fertigation sheets.

Reads only what is stored on the sheets themselves. Every line already carries
the unit price that applied when it was raised, and every tank its effective set
count, so these figures are a sum of what was recorded rather than a
recalculation against today's register. That distinction matters on a farm: a
fertiliser repriced in March must not restate what February's feeding cost.

**The prices are placeholders.** The register ships with indicative figures, not
the farm's invoices. Until those are replaced every cost here is arithmetic on a
guess, and the portal says so where the numbers are shown.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Fertigation
from ..schemas import FertigationCostRow, FertigationUsageRow, FertigationWaterRow
from . import fertigation as calc


async def _sheets(
    db: AsyncSession,
    *,
    start: date | None = None,
    end: date | None = None,
    activity: str | None = None,
) -> list[Fertigation]:
    q = select(Fertigation).order_by(Fertigation.event_date.desc())
    if start is not None:
        q = q.where(Fertigation.event_date >= start)
    if end is not None:
        q = q.where(Fertigation.event_date <= end)
    if activity:
        q = q.where(Fertigation.activity == activity)
    return list((await db.execute(q)).scalars().all())


def _sheet_cost(sheet: Fertigation) -> float:
    stock_l = calc.stock_required_l(sheet.volume_m3, sheet.fertiliser_rate_l_m3)
    acid_l = calc.stock_required_l(sheet.volume_m3, sheet.acid_rate_l_m3)
    return calc.total_cost(sheet.tanks, stock_l, acid_l)


def _sheet_area(sheet: Fertigation) -> float:
    """Area fed. A stored figure wins; otherwise sum the blocks (BR-001)."""
    if sheet.area_ha is not None:
        return float(sheet.area_ha)
    return calc.selected_area_ha(sheet.blocks)


async def cost_by(
    db: AsyncSession,
    group: str,
    *,
    start: date | None = None,
    end: date | None = None,
    activity: str | None = None,
) -> list[FertigationCostRow]:
    """Cost and water grouped by ``phase``, ``block``, ``month`` or ``activity``.

    Grouping by block splits a phase-wide sheet across the blocks it fed, using
    each block's own volume where one was recorded and its share of the area
    otherwise. A sheet covering six greenhouses is not six times the cost — it
    is one cost divided among them, and reporting it any other way would make
    the farm's feeding bill look several times larger than it is.
    """
    sheets = await _sheets(db, start=start, end=end, activity=activity)

    agg: dict[str, dict[str, float]] = defaultdict(
        lambda: {"sheets": 0.0, "volume": 0.0, "area": 0.0, "cost": 0.0}
    )

    for sheet in sheets:
        cost = _sheet_cost(sheet)
        area = _sheet_area(sheet)
        volume = float(sheet.volume_m3 or 0)

        if group == "block":
            blocks = list(sheet.blocks)
            if not blocks:
                continue
            total_area = calc.selected_area_ha(blocks)
            for block in blocks:
                block_area = float(block.area_ha or 0)
                # Share by area where we have it, evenly where we do not — a
                # block with no registered area still has to appear, or the
                # farm's total silently stops adding up.
                share = (
                    block_area / total_area
                    if total_area > 0 and block_area > 0
                    else 1.0 / len(blocks)
                )
                row = agg[block.name or block.code or f"#{block.greenhouse_id}"]
                row["sheets"] += 1
                row["volume"] += (
                    float(block.volume_m3) if block.volume_m3 is not None else volume * share
                )
                row["area"] += block_area
                row["cost"] += cost * share
            continue

        if group == "phase":
            key = sheet.phase or "Not on a phase"
        elif group == "month":
            key = sheet.event_date.strftime("%Y-%m")
        elif group == "activity":
            key = (sheet.activity or "fertigation").replace("_", " ").title()
        else:
            raise ValueError(f"Unknown grouping {group!r}")

        row = agg[key]
        row["sheets"] += 1
        row["volume"] += volume
        row["area"] += area
        row["cost"] += cost

    out = [
        FertigationCostRow(
            key=key,
            sheets=int(v["sheets"]),
            volume_m3=round(v["volume"], 2),
            area_ha=round(v["area"], 4),
            m3_per_ha=round(v["volume"] / v["area"], 2) if v["area"] > 0 else None,
            total_cost=round(v["cost"], 2),
        )
        for key, v in agg.items()
    ]
    # Months read chronologically; everything else is most-expensive-first,
    # which is the order somebody looking for where the money went wants.
    out.sort(key=lambda r: r.key if group == "month" else "")
    if group != "month":
        out.sort(key=lambda r: r.total_cost, reverse=True)
    return out


async def usage(
    db: AsyncSession,
    *,
    start: date | None = None,
    end: date | None = None,
    activity: str | None = None,
) -> list[FertigationUsageRow]:
    """Quantity of each product issued — quantity × the sets actually made up."""
    sheets = await _sheets(db, start=start, end=end, activity=activity)

    agg: dict[str, dict] = {}
    for sheet in sheets:
        stock_l = calc.stock_required_l(sheet.volume_m3, sheet.fertiliser_rate_l_m3)
        acid_l = calc.stock_required_l(sheet.volume_m3, sheet.acid_rate_l_m3)
        for tank in sheet.tanks:
            sets = calc.effective_sets(tank, stock_l, acid_l)
            for line in tank.lines:
                row = agg.setdefault(
                    line.fertiliser_code,
                    {
                        "name": line.fertiliser_name,
                        "unit": line.unit or "kg",
                        "quantity": 0.0,
                        "tanks": 0,
                        "sheets": set(),
                        "cost": 0.0,
                    },
                )
                row["quantity"] += float(line.quantity or 0) * sets
                row["tanks"] += 1
                row["sheets"].add(sheet.id)
                row["cost"] += calc.line_cost(line.quantity, sets, line.unit_price) or 0.0

    out = [
        FertigationUsageRow(
            code=code,
            name=v["name"],
            unit=v["unit"],
            quantity=round(v["quantity"], 2),
            tanks=v["tanks"],
            sheets=len(v["sheets"]),
            total_cost=round(v["cost"], 2),
        )
        for code, v in agg.items()
    ]
    out.sort(key=lambda r: r.total_cost, reverse=True)
    return out


async def water(
    db: AsyncSession,
    *,
    start: date | None = None,
    end: date | None = None,
    activity: str | None = None,
) -> list[FertigationWaterRow]:
    """One row per sheet: water applied against the rate that was planned."""
    sheets = await _sheets(db, start=start, end=end, activity=activity)

    out: list[FertigationWaterRow] = []
    for sheet in sheets:
        area = _sheet_area(sheet)
        volume = float(sheet.volume_m3) if sheet.volume_m3 is not None else None
        per_ha = calc.m3_per_ha(sheet.volume_m3, area or None)
        target = (
            float(sheet.target_m3_per_ha) if sheet.target_m3_per_ha is not None else None
        )
        variance = (
            round((per_ha - target) / target * 100, 1)
            if per_ha is not None and target
            else None
        )
        ordered = sorted(sheet.blocks, key=lambda b: (b.position, b.name or ""))
        label = ", ".join(b.name for b in ordered[:3] if b.name) or None
        if label and len(ordered) > 3:
            label += f" +{len(ordered) - 3} more"

        out.append(
            FertigationWaterRow(
                doc_id=sheet.doc_id,
                reference=sheet.reference,
                event_date=sheet.event_date,
                phase=sheet.phase,
                blocks=label,
                area_ha=round(area, 4) if area else None,
                volume_m3=volume,
                m3_per_ha=per_ha,
                target_m3_per_ha=target,
                variance_pct=variance,
                total_cost=round(_sheet_cost(sheet), 2),
                status=sheet.status,
            )
        )
    return out
