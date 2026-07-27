"""Compose a spray record from a chemical + block, with agronomy dosing.

Turns "spray chemical X on greenhouse Y" into a fully-costed, compliance-aware
record: label rate × block area → product qty and water volume, buying price →
cost, and pre-harvest interval → the earliest safe harvest date. Shared by the
offline batch ingest and the generate-from-recommendation flow.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Chemical, Greenhouse, SprayRecord


async def greenhouse_area_ha(db: AsyncSession, greenhouse_id: int | None) -> float | None:
    """Block area in hectares — stored value, else computed from the polygon."""
    if greenhouse_id is None:
        return None
    gh = await db.get(Greenhouse, greenhouse_id)
    if gh is None:
        return None
    if gh.area_ha is not None:
        return float(gh.area_ha)
    val = (
        await db.execute(
            select(func.ST_Area(func.geography(Greenhouse.boundary)) / 10000.0).where(
                Greenhouse.id == greenhouse_id
            )
        )
    ).scalar_one_or_none()
    return float(val) if val is not None else None


async def compose_spray(
    db: AsyncSession,
    *,
    greenhouse_id: int | None,
    chemical_id: int | None,
    recorded_at: datetime,
    bed_code: str | None = None,
    variety_code: str | None = None,
    coverage: str | None = None,
    comments: str | None = None,
    start_date: date | None = None,
    recommendation_id: int | None = None,
    client_record_id: str | None = None,
    program_id: str | None = None,
    scout_id: int | None = None,
) -> SprayRecord:
    chem = await db.get(Chemical, chemical_id) if chemical_id else None
    area = await greenhouse_area_ha(db, greenhouse_id)
    sd = start_date or date.today()

    phi = chem.phi_days if chem else None
    safe = sd + timedelta(days=phi) if phi is not None else None

    rate_per_ha = float(chem.rate_per_ha) if chem and chem.rate_per_ha is not None else None
    water_per_ha = (
        float(chem.water_rate_l_per_ha) if chem and chem.water_rate_l_per_ha is not None else None
    )
    price = float(chem.buying_price) if chem and chem.buying_price is not None else None

    qty = round(rate_per_ha * area, 3) if rate_per_ha is not None and area is not None else None
    water = round(water_per_ha * area) if water_per_ha is not None and area is not None else None
    cost = round(qty * price, 2) if qty is not None and price is not None else None

    return SprayRecord(
        client_record_id=client_record_id,
        program_id=program_id,
        recommendation_id=recommendation_id,
        greenhouse_id=greenhouse_id,
        bed_code=bed_code,
        variety_code=variety_code,
        scout_id=scout_id,
        chemical_id=chemical_id,
        product=(chem.product if chem else None) or (chem.name if chem else None),
        type_of_application=chem.type_of_application if chem else None,
        rate=chem.rate if chem else None,
        volume_of_water=f"{water} L" if water is not None else None,
        coverage=coverage,
        who_class=chem.who_class if chem else None,
        rac_code=chem.rac_code if chem else None,
        active_ingredient1=chem.active_ingredient1 if chem else None,
        active_ingredient2=chem.active_ingredient2 if chem else None,
        target1=chem.target1 if chem else None,
        target2=chem.target2 if chem else None,
        rei=chem.rei if chem else None,
        qty=qty,
        buying_price=price,
        cost_of_chemical=cost,
        area_ha=area,
        phi_days=phi,
        safe_harvest_date=safe,
        comments=comments,
        start_date=sd,
        recorded_at=recorded_at,
    )
