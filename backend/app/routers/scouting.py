"""Scouting capture — idempotent offline batch submit + listing.

Mirrors the field flow (select greenhouse → bed → disease/pest/lure/sticky →
variety + scores + notes), buffering many entries and submitting at once. Each
entry carries a device-generated ``client_record_id`` so repeated transmissions
are deduped (offline-first reliability). Threshold breaches raise intervention
recommendations on the spot.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee
from ..models import (
    Disease,
    Employee,
    Greenhouse,
    Pest,
    Recommendation,
    ScoutingRecord,
    SprayRecord,
    Variety,
)
from ..schemas import (
    BatchResult,
    ScoutingBatch,
    ScoutingDetail,
    ScoutingOut,
    SprayOut,
)
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
    pest_id: int | None = Query(default=None),
    disease_id: int | None = Query(default=None),
    variety_code: str | None = Query(default=None),
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
    if pest_id is not None:
        q = q.where(ScoutingRecord.pest_id == pest_id)
    if disease_id is not None:
        q = q.where(ScoutingRecord.disease_id == disease_id)
    if variety_code is not None:
        q = q.where(ScoutingRecord.variety_code == variety_code)
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
        # Data quality: flag likely fat-finger entries against this block's
        # own history, before they reach the trends. Runs pre-insert so the
        # record isn't compared against itself.
        record.flagged, record.flag_reason = await anomaly_check(db, record)

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


@router.get("/{record_id}", response_model=ScoutingDetail)
async def scouting_detail(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    """One observation, with its session, its history, and the loop it started.

    A record on its own says "severity 3 on Bed 7". A manager needs the rest:
    what the rest of that round found, whether this agent has been climbing on
    this bed, and — the question the whole product exists to answer — whether
    anything was sprayed as a result.
    """
    rec = await db.get(ScoutingRecord, record_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scouting record not found")

    gh = await db.get(Greenhouse, rec.greenhouse_id) if rec.greenhouse_id else None
    pest = await db.get(Pest, rec.pest_id) if rec.pest_id else None
    disease = await db.get(Disease, rec.disease_id) if rec.disease_id else None
    scout = await db.get(Employee, rec.scout_id) if rec.scout_id else None
    variety = None
    if rec.variety_code:
        variety = (
            await db.execute(select(Variety).where(Variety.code == rec.variety_code))
        ).scalar_one_or_none()

    # The round this was captured in.
    session_records = session_beds = 0
    session_start = session_end = None
    if rec.batch_id:
        row = (
            await db.execute(
                select(
                    func.count(),
                    func.count(func.distinct(ScoutingRecord.bed_code)),
                    func.min(ScoutingRecord.recorded_at),
                    func.max(ScoutingRecord.recorded_at),
                ).where(ScoutingRecord.batch_id == rec.batch_id)
            )
        ).one()
        session_records, session_beds, session_start, session_end = row

    # Same agent, same bed, over time — is this getting worse?
    hist_q = select(
        ScoutingRecord.id, ScoutingRecord.severity, ScoutingRecord.recorded_at
    ).where(
        ScoutingRecord.greenhouse_id == rec.greenhouse_id,
        ScoutingRecord.bed_code == rec.bed_code,
    )
    if rec.pest_id is not None:
        hist_q = hist_q.where(ScoutingRecord.pest_id == rec.pest_id)
    elif rec.disease_id is not None:
        hist_q = hist_q.where(ScoutingRecord.disease_id == rec.disease_id)
    else:
        hist_q = hist_q.where(ScoutingRecord.id == rec.id)
    history = [
        {
            "id": h.id,
            "severity": h.severity,
            "recorded_at": h.recorded_at.isoformat(),
            "is_this": h.id == rec.id,
        }
        for h in (
            await db.execute(hist_q.order_by(ScoutingRecord.recorded_at.asc()).limit(30))
        ).all()
    ]

    # The recommendation this block+agent carries, and what was sprayed for it.
    rec_q = select(Recommendation).where(Recommendation.greenhouse_id == rec.greenhouse_id)
    if rec.pest_id is not None:
        rec_q = rec_q.where(Recommendation.pest_id == rec.pest_id)
    elif rec.disease_id is not None:
        rec_q = rec_q.where(Recommendation.disease_id == rec.disease_id)
    else:
        rec_q = rec_q.where(Recommendation.id.is_(None))
    recommendation = (
        await db.execute(rec_q.order_by(Recommendation.created_at.desc()).limit(1))
    ).scalar_one_or_none()

    sprays: list[SprayRecord] = []
    if recommendation is not None:
        sprays = list(
            (
                await db.execute(
                    select(SprayRecord)
                    .where(SprayRecord.recommendation_id == recommendation.id)
                    .order_by(SprayRecord.recorded_at.asc())
                )
            ).scalars().all()
        )

    return ScoutingDetail(
        record=ScoutingOut.model_validate(rec),
        greenhouse=gh.name if gh else None,
        greenhouse_code=(gh.code if gh else None),
        pest=pest.name if pest else None,
        disease=disease.name if disease else None,
        variety=variety.name if variety else rec.variety_code,
        scout=scout.name if scout else None,
        session_records=int(session_records or 0),
        session_beds=int(session_beds or 0),
        session_started_at=session_start,
        session_ended_at=session_end,
        recommendation_id=recommendation.id if recommendation else None,
        recommendation_note=recommendation.note if recommendation else None,
        recommendation_status=recommendation.status if recommendation else None,
        recommendation_outcome=recommendation.outcome_note if recommendation else None,
        sprays=[SprayOut.model_validate(s) for s in sprays],
        history=history,
    )
