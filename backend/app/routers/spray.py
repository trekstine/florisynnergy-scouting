"""Spray capture — idempotent batch submit (a program = many products)."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..models import Chemical, Employee, Recommendation, SprayRecord
from ..schemas import (
    BatchResult,
    ComplianceIssue,
    SprayBatch,
    SprayOut,
    SprayPreviewOut,
    SprayPreviewRequest,
    SprayProgramCreate,
    SprayProgramOut,
)
from ..services.compliance import blocked as is_blocked
from ..services.compliance import check_spray
from ..services.spray import compose_spray

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


# ───────────────────────── Program builder ──────────────────────────────
# The one-click "generate spray from a recommendation" composes a record
# invisibly. These two endpoints split that into *show the maths* and *commit
# the decision*, so a manager sees dosing, cost, PHI and compliance before
# anything is written — while the ETL engine still does the suggesting.


@router.post("/preview", response_model=SprayPreviewOut)
async def preview_spray_product(
    payload: SprayPreviewRequest,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Compute what one product would cost and constrain — without saving."""
    chem = await db.get(Chemical, payload.chemical_id)
    if chem is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chemical not found")

    draft = await compose_spray(
        db,
        greenhouse_id=payload.greenhouse_id,
        chemical_id=payload.chemical_id,
        recorded_at=datetime.now(timezone.utc),
        bed_code=payload.bed_code,
        variety_code=payload.variety_code,
        coverage=payload.coverage,
        start_date=payload.start_date,
    )
    issues = await check_spray(
        db,
        greenhouse_id=payload.greenhouse_id,
        chemical_id=payload.chemical_id,
        pest_id=payload.pest_id,
        disease_id=payload.disease_id,
    )

    return SprayPreviewOut(
        chemical_id=chem.id,
        name=chem.name,
        product=draft.product,
        type_of_application=draft.type_of_application,
        rate=draft.rate,
        area_ha=float(draft.area_ha) if draft.area_ha is not None else None,
        qty=float(draft.qty) if draft.qty is not None else None,
        volume_of_water=draft.volume_of_water,
        buying_price=float(draft.buying_price) if draft.buying_price is not None else None,
        cost_of_chemical=(
            float(draft.cost_of_chemical) if draft.cost_of_chemical is not None else None
        ),
        who_class=draft.who_class,
        rac_code=draft.rac_code,
        active_ingredient1=draft.active_ingredient1,
        target1=draft.target1,
        target2=draft.target2,
        rei=draft.rei,
        phi_days=draft.phi_days,
        safe_harvest_date=draft.safe_harvest_date,
        issues=[ComplianceIssue(level=i.level, code=i.code, message=i.message) for i in issues],
        blocked=is_blocked(issues),
    )


@router.post(
    "/program", response_model=SprayProgramOut, status_code=status.HTTP_201_CREATED
)
async def create_spray_program(
    payload: SprayProgramCreate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Commit a reviewed, multi-product program as one application event."""
    rec: Recommendation | None = None
    if payload.recommendation_id is not None:
        rec = await db.get(Recommendation, payload.recommendation_id)
        if rec is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")

    # Screen every product before writing any of them.
    all_blocking: list[str] = []
    for item in payload.items:
        issues = await check_spray(
            db,
            greenhouse_id=payload.greenhouse_id,
            chemical_id=item.chemical_id,
            pest_id=rec.pest_id if rec else None,
            disease_id=rec.disease_id if rec else None,
        )
        all_blocking += [i.message for i in issues if i.level == "block"]

    if all_blocking and not payload.override:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Blocked by compliance: " + "; ".join(all_blocking),
        )

    comments = payload.comments
    if payload.override and all_blocking:
        comments = f"[Compliance override] {'; '.join(all_blocking)}" + (
            f" — {comments}" if comments else ""
        )

    program_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    records: list[SprayRecord] = []
    for item in payload.items:
        record = await compose_spray(
            db,
            greenhouse_id=payload.greenhouse_id,
            chemical_id=item.chemical_id,
            recorded_at=now,
            bed_code=payload.bed_code,
            variety_code=payload.variety_code,
            coverage=payload.coverage,
            comments=comments,
            start_date=payload.start_date,
            recommendation_id=payload.recommendation_id,
            client_record_id=str(uuid.uuid4()),
            program_id=program_id,
            scout_id=current.id,
        )
        db.add(record)
        records.append(record)

    # Close the loop: a planned program marks its recommendation actioned.
    if rec is not None:
        if len(payload.items) == 1:
            rec.recommended_chemical_id = payload.items[0].chemical_id
        if rec.status in ("open", "planned"):
            rec.status = "actioned"

    await db.commit()
    for r in records:
        await db.refresh(r)

    total = sum(float(r.cost_of_chemical or 0) for r in records)
    harvest_dates = [r.safe_harvest_date for r in records if r.safe_harvest_date]

    return SprayProgramOut(
        program_id=program_id,
        records=[SprayOut.model_validate(r) for r in records],
        total_cost=round(total, 2),
        # The block is locked until the *longest* PHI clears.
        safe_harvest_date=max(harvest_dates) if harvest_dates else None,
    )
