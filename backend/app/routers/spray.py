"""Spray capture — idempotent batch submit (a program = many products)."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee
from ..models import Chemical, Employee, SprayRecord
from ..schemas import BatchResult, SprayBatch, SprayOut

router = APIRouter(prefix="/spray", tags=["spray"])


@router.get("", response_model=list[SprayOut])
async def list_spray(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
    greenhouse_id: int | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
):
    q = select(SprayRecord)
    if greenhouse_id is not None:
        q = q.where(SprayRecord.greenhouse_id == greenhouse_id)
    return (
        await db.execute(q.order_by(SprayRecord.recorded_at.desc()).limit(limit))
    ).scalars().all()


@router.post("/batch", response_model=BatchResult)
async def submit_spray_batch(
    payload: SprayBatch,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(get_current_employee),
):
    result = BatchResult(accepted=[], duplicates=[], rejected={})

    ids = [e.client_record_id for e in payload.entries]
    existing = set()
    if ids:
        existing = set(
            (
                await db.execute(
                    select(SprayRecord.client_record_id).where(
                        SprayRecord.client_record_id.in_(ids)
                    )
                )
            ).scalars().all()
        )

    seen: set[str] = set()
    for e in payload.entries:
        cid = e.client_record_id
        if cid in existing or cid in seen:
            result.duplicates.append(cid)
            continue
        seen.add(cid)

        # Denormalise chemical detail onto the record for fast reporting.
        chem = await db.get(Chemical, e.chemical_id) if e.chemical_id else None
        phi = chem.phi_days if chem else None
        safe_harvest = (
            e.start_date + timedelta(days=phi)
            if phi is not None and e.start_date is not None
            else None
        )
        record = SprayRecord(
            client_record_id=cid,
            program_id=payload.program_id,
            recommendation_id=e.recommendation_id,
            greenhouse_id=e.greenhouse_id,
            bed_code=e.bed_code,
            variety_code=e.variety_code,
            scout_id=current.id,
            chemical_id=e.chemical_id,
            product=e.product or (chem.product if chem else None) or (chem.name if chem else None),
            type_of_application=e.type_of_application or (chem.type_of_application if chem else None),
            rate=e.rate or (chem.rate if chem else None),
            volume_of_water=e.volume_of_water,
            coverage=e.coverage,
            who_class=chem.who_class if chem else None,
            rac_code=chem.rac_code if chem else None,
            active_ingredient1=chem.active_ingredient1 if chem else None,
            active_ingredient2=chem.active_ingredient2 if chem else None,
            target1=chem.target1 if chem else None,
            target2=chem.target2 if chem else None,
            rei=chem.rei if chem else None,
            qty=e.qty,
            buying_price=e.buying_price if e.buying_price is not None else (float(chem.buying_price) if chem and chem.buying_price is not None else None),
            cost_of_chemical=e.cost_of_chemical,
            phi_days=phi,
            safe_harvest_date=safe_harvest,
            comments=e.comments,
            start_date=e.start_date,
            start_time=e.start_time,
            recorded_at=e.recorded_at,
        )
        try:
            async with db.begin_nested():
                db.add(record)
        except IntegrityError:
            result.duplicates.append(cid)
            seen.discard(cid)
            continue
        result.accepted.append(cid)

    await db.commit()
    return result
