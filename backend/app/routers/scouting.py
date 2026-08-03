"""Scouting capture — idempotent offline batch submit + listing.

Mirrors the field flow (select greenhouse → bed → disease/pest/lure/sticky →
variety + scores + notes), buffering many entries and submitting at once. Each
entry carries a device-generated ``client_record_id`` so repeated transmissions
are deduped (offline-first reliability). Threshold breaches raise intervention
recommendations on the spot.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee
from ..models import Employee, ScoutingRecord
from ..schemas import BatchResult, ScoutingBatch, ScoutingOut
from ..services.recommendations import evaluate_entry, evaluate_outcome
from ..services.validation import anomaly_check

router = APIRouter(prefix="/scouting", tags=["scouting"])


@router.get("", response_model=list[ScoutingOut])
async def list_scouting(
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(get_current_employee),
    greenhouse_id: int | None = Query(default=None),
    scouting_for: str | None = Query(default=None),
    scout_id: int | None = Query(default=None),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=200, le=1000),
):
    q = select(ScoutingRecord)
    # Scouts see only their own captures; supervisors/admins see all.
    if current.role == "scout":
        q = q.where(ScoutingRecord.scout_id == current.id)
    elif scout_id is not None:
        q = q.where(ScoutingRecord.scout_id == scout_id)
    if greenhouse_id is not None:
        q = q.where(ScoutingRecord.greenhouse_id == greenhouse_id)
    if scouting_for is not None:
        q = q.where(ScoutingRecord.scouting_for == scouting_for)
    if start is not None:
        q = q.where(
            ScoutingRecord.recorded_at
            >= datetime.combine(start, time.min, tzinfo=timezone.utc)
        )
    if end is not None:
        q = q.where(
            ScoutingRecord.recorded_at
            < datetime.combine(end, time.min, tzinfo=timezone.utc) + timedelta(days=1)
        )
    rows = (
        await db.execute(q.order_by(ScoutingRecord.recorded_at.desc()).limit(limit))
    ).scalars().all()
    return rows


@router.post("/batch", response_model=BatchResult)
async def submit_batch(
    payload: ScoutingBatch,
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
                    select(ScoutingRecord.client_record_id).where(
                        ScoutingRecord.client_record_id.in_(ids)
                    )
                )
            ).scalars().all()
        )

    seen: set[str] = set()
    recs_created = 0

    for e in payload.entries:
        cid = e.client_record_id
        if cid in existing or cid in seen:
            result.duplicates.append(cid)
            continue
        seen.add(cid)

        record = ScoutingRecord(
            client_record_id=cid,
            batch_id=payload.batch_id,
            greenhouse_id=e.greenhouse_id,
            bed_id=e.bed_id,
            bed_code=e.bed_code,
            scout_id=current.id,
            scouting_for=e.scouting_for,
            variety_id=e.variety_id,
            variety_code=e.variety_code,
            pest_id=e.pest_id,
            disease_id=e.disease_id,
            lure_id=e.lure_id,
            sticky_trap_id=e.sticky_trap_id,
            stage=e.stage,
            location_on_plant=e.location_on_plant,
            severity=e.severity,
            fcm_count=e.fcm_count,
            sticky_trap_bug_count=e.sticky_trap_bug_count,
            lure_bug_count=e.lure_bug_count,
            beneficials_count=e.beneficials_count,
            notes=e.notes,
            session_comment=payload.comments,
            image_url=e.image_url,
            gps_lat=e.gps_lat,
            gps_lng=e.gps_lng,
            verification_method=e.verification_method,
            recorded_at=e.recorded_at,
        )
        try:
            async with db.begin_nested():
                db.add(record)
        except IntegrityError:
            result.duplicates.append(cid)
            seen.discard(cid)
            continue

        # Threshold → recommendation (own savepoint so a failure can't poison the batch).
        try:
            async with db.begin_nested():
                if await evaluate_entry(db, record):
                    recs_created += 1
        except IntegrityError:
            pass

        # Re-scout → close the loop on any actioned recommendation for this block+agent.
        try:
            async with db.begin_nested():
                await evaluate_outcome(db, record)
        except IntegrityError:
            pass

        result.accepted.append(cid)

    await db.commit()
    result.recommendations_created = recs_created
    return result
