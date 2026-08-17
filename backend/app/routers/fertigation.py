"""Fertigation — creating, listing, editing and issuing the sheet.

A fertigation is the farm's feeding document: a date, a block, the water that
went on it, and what was made up in each stock tank. It signs through the same
approval slots a spray does, as ``document_type = "fertigation"``.

Deliberately narrower than the full functional specification: no proposals, no
stores issue and return, no meter readings. Those need answers the farm has not
given yet — what the daily per-greenhouse figures actually measure, whether
Tank C scales with the A/B set count — and building on a guess would be worse
than waiting.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..models import (
    Employee,
    Fertigation,
    FertigationLine,
    FertigationSource,
    FertigationTank,
    Fertiliser,
    Greenhouse,
    Signature,
)
from ..schemas import (
    FertigationIn,
    FertigationLineOut,
    FertigationOut,
    FertigationSourceOut,
    FertigationTankOut,
    FertiliserIn,
    FertiliserOut,
)
from ..services import fertigation as calc

router = APIRouter(prefix="/fertigation", tags=["fertigation"])

DOC_TYPE = "fertigation"


# ───────────────────────────── Fertiliser register ───────────────────────────
@router.get("/fertilisers", response_model=list[FertiliserOut])
async def list_fertilisers(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
    include_inactive: bool = Query(default=False),
):
    q = select(Fertiliser).order_by(Fertiliser.default_tank, Fertiliser.code)
    if not include_inactive:
        q = q.where(Fertiliser.is_active.is_(True))
    return (await db.execute(q)).scalars().all()


@router.post(
    "/fertilisers", response_model=FertiliserOut, status_code=status.HTTP_201_CREATED
)
async def create_fertiliser(
    payload: FertiliserIn,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin", "supervisor")),
):
    row = Fertiliser(**payload.model_dump())
    db.add(row)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That code is already in use.")
    await db.refresh(row)
    return row


@router.patch("/fertilisers/{fertiliser_id}", response_model=FertiliserOut)
async def update_fertiliser(
    fertiliser_id: int,
    payload: FertiliserIn,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin", "supervisor")),
):
    row = await db.get(Fertiliser, fertiliser_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fertiliser not found")
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


# ─────────────────────────────── Fertigations ────────────────────────────────
async def _signature_count(db: AsyncSession, doc_id: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(Signature)
            .where(
                Signature.document_type == DOC_TYPE,
                Signature.document_id == doc_id,
                Signature.voided_at.is_(None),
            )
        )
    ).scalar_one()


async def _to_out(db: AsyncSession, row: Fertigation) -> FertigationOut:
    """Assemble the record with everything derived from it."""
    gh = await db.get(Greenhouse, row.greenhouse_id) if row.greenhouse_id else None
    applicator = (
        await db.get(Employee, row.applicator_id) if row.applicator_id else None
    )
    preparer = await db.get(Employee, row.prepared_by) if row.prepared_by else None

    # Derived once, here, so the list, the detail and the document cannot
    # disagree about how many sets a tank is making up.
    stock_l = calc.stock_required_l(row.volume_m3, row.fertiliser_rate_l_m3)
    acid_l = calc.stock_required_l(row.volume_m3, row.acid_rate_l_m3)

    tanks = []
    for t in sorted(row.tanks, key=lambda t: t.code):
        effective = calc.effective_sets(t, stock_l, acid_l)
        tanks.append(
            FertigationTankOut(
                id=t.id,
                code=t.code,
                volume_l=t.volume_l,
                sets_mode=t.sets_mode,
                sets=t.sets,
                note=t.note,
                lines=[FertigationLineOut.model_validate(x) for x in t.lines],
                implied_sets=calc.implied_sets(t, stock_l, acid_l),
                effective_sets=effective,
                is_acid_tank=calc.is_acid_tank(t),
                total_cost=calc.tank_cost(t, effective),
            )
        )

    return FertigationOut(
        id=row.id,
        doc_id=row.doc_id,
        reference=row.reference,
        activity=row.activity,
        event_date=row.event_date,
        effective_from=row.effective_from,
        start_time=row.start_time,
        phase=row.phase,
        greenhouse_id=row.greenhouse_id,
        greenhouse=gh.name if gh else None,
        type_of_application=row.type_of_application,
        volume_m3=row.volume_m3,
        area_ha=row.area_ha,
        fertiliser_rate_l_m3=row.fertiliser_rate_l_m3,
        acid_rate_l_m3=row.acid_rate_l_m3,
        applicator_id=row.applicator_id,
        applicator=applicator.name if applicator else None,
        prepared_by=row.prepared_by,
        prepared_by_name=preparer.name if preparer else None,
        comments=row.comments,
        status=row.status,
        created_at=row.created_at,
        tanks=tanks,
        sources=[FertigationSourceOut.model_validate(s) for s in row.sources],
        total_cost=calc.total_cost(row.tanks, stock_l, acid_l),
        stock_required_l=stock_l,
        acid_required_l=acid_l,
        m3_per_ha=calc.m3_per_ha(row.volume_m3, row.area_ha),
        sources_total_m3=calc.sources_total_m3(row.sources),
        source_note=calc.source_mismatch(row.volume_m3, row.sources),
        signature_count=await _signature_count(db, row.doc_id),
    )


async def _apply(db: AsyncSession, row: Fertigation, payload: FertigationIn) -> None:
    """Write the payload onto the record, rebuilding tanks and sources.

    Prices are copied onto each line at write time. A fertiliser repriced next
    month must not silently restate what this sheet cost.
    """
    for field in (
        "activity", "event_date", "effective_from", "start_time", "phase",
        "greenhouse_id", "type_of_application", "volume_m3", "area_ha",
        "fertiliser_rate_l_m3", "acid_rate_l_m3", "applicator_id", "comments",
        "status", "reference",
    ):
        setattr(row, field, getattr(payload, field))

    if row.area_ha is None and row.greenhouse_id:
        gh = await db.get(Greenhouse, row.greenhouse_id)
        row.area_ha = getattr(gh, "area_ha", None) if gh else None

    register = {
        f.id: f for f in (await db.execute(select(Fertiliser))).scalars()
    }

    stock_l = calc.stock_required_l(row.volume_m3, row.fertiliser_rate_l_m3)
    acid_l = calc.stock_required_l(row.volume_m3, row.acid_rate_l_m3)

    row.tanks.clear()
    for tank_in in payload.tanks:
        tank = FertigationTank(
            code=tank_in.code.strip().upper(),
            volume_l=tank_in.volume_l,
            sets_mode=tank_in.sets_mode,
            sets=tank_in.sets,
            note=tank_in.note,
        )
        for i, line_in in enumerate(tank_in.lines):
            f = register.get(line_in.fertiliser_id or -1)
            tank.lines.append(
                FertigationLine(
                    fertiliser_id=line_in.fertiliser_id,
                    fertiliser_code=line_in.fertiliser_code.strip().upper(),
                    fertiliser_name=line_in.fertiliser_name or (f.name if f else None),
                    quantity=line_in.quantity,
                    unit=line_in.unit or (f.unit if f else None) or "kg",
                    is_acid=bool(f.is_acid) if f else False,
                    unit_price=f.price_per_unit if f else None,
                    position=line_in.position or i,
                )
            )
        # Costed after the lines are attached, because whether this is an acid
        # tank — and so which rate its set count derives from — depends on what
        # is in it.
        sets = calc.effective_sets(tank, stock_l, acid_l)
        tank.sets = sets
        for line in tank.lines:
            line.cost = calc.line_cost(line.quantity, sets, line.unit_price)
        row.tanks.append(tank)

    row.sources.clear()
    for src in payload.sources:
        row.sources.append(FertigationSource(**src.model_dump()))


@router.get("", response_model=list[FertigationOut])
async def list_fertigations(
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
    activity: str | None = Query(default=None),
    greenhouse_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=200, le=500),
):
    q = select(Fertigation).order_by(
        Fertigation.event_date.desc(), Fertigation.id.desc()
    ).limit(limit)
    if activity:
        q = q.where(Fertigation.activity == activity)
    if greenhouse_id is not None:
        q = q.where(Fertigation.greenhouse_id == greenhouse_id)
    if status_filter:
        q = q.where(Fertigation.status == status_filter)
    if start is not None:
        q = q.where(Fertigation.event_date >= start)
    if end is not None:
        q = q.where(Fertigation.event_date <= end)

    rows = (await db.execute(q)).scalars().all()
    return [await _to_out(db, r) for r in rows]


@router.get("/{doc_id}", response_model=FertigationOut)
async def get_fertigation(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    row = (
        await db.execute(select(Fertigation).where(Fertigation.doc_id == doc_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fertigation not found")
    return await _to_out(db, row)


@router.get("/{doc_id}/warnings", response_model=list[str])
async def fertigation_warnings(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    """Chemistry problems in the tank make-up, if any."""
    row = (
        await db.execute(select(Fertigation).where(Fertigation.doc_id == doc_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fertigation not found")
    return calc.tank_warnings(row.tanks)


@router.post("", response_model=FertigationOut, status_code=status.HTTP_201_CREATED)
async def create_fertigation(
    payload: FertigationIn,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    row = Fertigation(doc_id=str(uuid.uuid4()), prepared_by=current.id)
    await _apply(db, row, payload)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _to_out(db, row)


async def _editable(db: AsyncSession, row: Fertigation) -> None:
    """A signed sheet is what somebody approved; it stops being editable.

    Same rule as a spray programme, for the same reason — otherwise a named
    person is on record approving a feed they never saw.
    """
    if await _signature_count(db, row.doc_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This sheet has been signed and can no longer be edited. Void the "
            "signatures on the fertigation document first.",
        )


@router.put("/{doc_id}", response_model=FertigationOut)
async def update_fertigation(
    doc_id: str,
    payload: FertigationIn,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin", "supervisor")),
):
    row = (
        await db.execute(select(Fertigation).where(Fertigation.doc_id == doc_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fertigation not found")
    await _editable(db, row)

    await _apply(db, row, payload)
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return await _to_out(db, row)


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_fertigation(
    doc_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin")),
):
    row = (
        await db.execute(select(Fertigation).where(Fertigation.doc_id == doc_id))
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fertigation not found")
    await _editable(db, row)
    await db.delete(row)
    await db.commit()
