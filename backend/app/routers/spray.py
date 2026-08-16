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
from ..models import (
    Chemical,
    Employee,
    Recommendation,
    SprayAttachment,
    SprayRecord,
)
from ..schemas import (
    BatchResult,
    ComplianceIssue,
    SprayAttachmentCreate,
    SprayAttachmentOut,
    SprayBatch,
    SprayOut,
    SprayPreviewOut,
    SprayPreviewRequest,
    SprayProgramCreate,
    SprayProgramOut,
    SprayStatusUpdate,
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
        volume_of_water_l=payload.volume_of_water_l,
        rate=payload.rate,
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


async def _build_program(
    db: AsyncSession,
    payload: SprayProgramCreate,
    program_id: str,
    current: Employee,
) -> tuple[list[SprayRecord], Recommendation | None]:
    """Screen, dose and cost a program's products.

    Shared by create and edit so an edited program is held to exactly the same
    compliance bar as a new one — a corrected tank mix that quietly skipped the
    RAC rotation check would be worse than no edit at all.
    """
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

    # Tank-mix resistance check. check_spray() screens each product against
    # what was sprayed *before*, so it cannot see two products in this very
    # mix sharing a mode of action — which defeats rotation just as surely.
    if len(payload.items) > 1:
        seen_rac: dict[str, str] = {}
        for item in payload.items:
            chem = await db.get(Chemical, item.chemical_id)
            if chem is None or not chem.rac_code:
                continue
            other = seen_rac.get(chem.rac_code)
            if other:
                all_blocking.append(
                    f"{chem.name} and {other} share mode of action RAC {chem.rac_code} "
                    "— tank-mixing them adds no resistance benefit."
                )
            else:
                seen_rac[chem.rac_code] = chem.name

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

    now = datetime.now(timezone.utc)
    records: list[SprayRecord] = []
    for item in payload.items:
        record = await compose_spray(
            db,
            greenhouse_id=payload.greenhouse_id,
            chemical_id=item.chemical_id,
            recorded_at=now,
            bed_code=payload.bed_code,
            partition_no=payload.partition_no,
            variety_code=payload.variety_code,
            type_of_application=payload.type_of_application,
            coverage=payload.coverage,
            rei=payload.rei,
            volume_of_water_l=payload.volume_of_water_l,
            rate=item.rate,
            comments=comments,
            start_date=payload.start_date,
            start_time=payload.start_time,
            scout_report_date=payload.scout_report_date,
            recommendation_id=payload.recommendation_id,
            client_record_id=str(uuid.uuid4()),
            program_id=program_id,
            scout_id=current.id,
        )
        db.add(record)
        records.append(record)

    return records, rec


@router.post(
    "/program", response_model=SprayProgramOut, status_code=status.HTTP_201_CREATED
)
async def create_spray_program(
    payload: SprayProgramCreate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Commit a reviewed, multi-product program as one application event."""
    program_id = str(uuid.uuid4())
    records, rec = await _build_program(db, payload, program_id, current)

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


# ───────────────────── Program lifecycle & e-filing ─────────────────────
# A program is planned before it is sprayed and only reviewed once a later
# round has been walked. The status lives on every row of the program (they
# share a program_id), so any one record answers "did this actually go out?".


async def _program_rows(db: AsyncSession, program_id: str) -> list[SprayRecord]:
    rows = list(
        (
            await db.execute(
                select(SprayRecord).where(SprayRecord.program_id == program_id)
            )
        ).scalars().all()
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Spray program not found")
    return rows


@router.patch("/programs/{program_id}/status", response_model=list[SprayOut])
async def update_program_status(
    program_id: str,
    payload: SprayStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Mark a program applied, or review it once the follow-up round is in."""
    rows = await _program_rows(db, program_id)
    now = datetime.now(timezone.utc)

    for r in rows:
        r.program_status = payload.status
        if payload.status == "applied":
            r.applied_at = payload.applied_at or now
            r.applied_by = current.id
            # Re-marking as applied clears a previous review, otherwise the
            # record would claim to be reviewed against an older application.
            r.reviewed_at = None
            r.reviewed_by = None
        elif payload.status == "reviewed":
            if r.applied_at is None:
                r.applied_at = payload.applied_at or now
                r.applied_by = r.applied_by or current.id
            r.reviewed_at = now
            r.reviewed_by = current.id
            r.review_comment = payload.review_comment
            r.effectiveness = payload.effectiveness
        else:  # back to planned
            r.applied_at = r.reviewed_at = None
            r.applied_by = r.reviewed_by = None
            r.review_comment = r.effectiveness = None

    await db.commit()
    for r in rows:
        await db.refresh(r)
    return [SprayOut.model_validate(r) for r in rows]


@router.put("/programs/{program_id}", response_model=SprayProgramOut)
async def update_spray_program(
    program_id: str,
    payload: SprayProgramCreate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Correct a program that has not gone out yet.

    Only while the program is still *planned*. Once it is marked applied the
    chemical is on the crop and a signed approval sheet is in a file somewhere;
    editing it then would leave the paperwork describing a spray that never
    happened. Corrections after application belong in the effectiveness review,
    or in a new program.

    The block is fixed too — a spray on a different greenhouse is a different
    application event, not an edit of this one.
    """
    existing = await _program_rows(db, program_id)
    head = existing[0]

    if head.program_status != "planned":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This program is marked {head.program_status} and can no longer be "
            "edited. Record a review, or raise a new program.",
        )
    if payload.greenhouse_id != head.greenhouse_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A program cannot be moved to another greenhouse — raise a new one.",
        )

    # Keep the program's identity: the same id, so the approval sheet URL, the
    # filed attachments and any link from a scouting report all still resolve.
    records, rec = await _build_program(db, payload, program_id, current)

    # The rebuilt rows replace the old ones. Deleting after the build means a
    # compliance rejection leaves the original program untouched.
    for row in existing:
        await db.delete(row)

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
        safe_harvest_date=max(harvest_dates) if harvest_dates else None,
    )


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_spray_program(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin")),
):
    """Withdraw a program that was raised in error — planned ones only."""
    rows = await _program_rows(db, program_id)
    if rows[0].program_status != "planned":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An applied program is a record of what went on the crop and cannot "
            "be deleted.",
        )
    for row in rows:
        await db.delete(row)
    await db.commit()


@router.get("/programs/{program_id}/attachments", response_model=list[SprayAttachmentOut])
async def list_attachments(
    program_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    return (
        await db.execute(
            select(SprayAttachment)
            .where(SprayAttachment.program_id == program_id)
            .order_by(SprayAttachment.uploaded_at.desc())
        )
    ).scalars().all()


@router.post(
    "/programs/{program_id}/attachments",
    response_model=SprayAttachmentOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_attachment(
    program_id: str,
    payload: SprayAttachmentCreate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """File a document against a program — typically the signed approval sheet.

    The file itself is uploaded through /media/upload; this records it against
    the program so the paperwork lives with the application it authorises.
    """
    await _program_rows(db, program_id)  # 404 if the program doesn't exist
    row = SprayAttachment(
        program_id=program_id,
        filename=payload.filename,
        url=payload.url,
        content_type=payload.content_type,
        size_bytes=payload.size_bytes,
        kind=payload.kind,
        note=payload.note,
        uploaded_by=current.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete(
    "/programs/{program_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    program_id: str,
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(require_roles("admin", "supervisor")),
):
    row = await db.get(SprayAttachment, attachment_id)
    if row is None or row.program_id != program_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    await db.delete(row)
    await db.commit()
