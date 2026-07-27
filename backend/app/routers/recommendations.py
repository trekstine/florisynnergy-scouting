"""Intervention recommendations."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import require_roles
from ..models import Disease, Employee, Pest, Recommendation
from ..schemas import (
    ComplianceIssue,
    ComplianceResult,
    RecommendationCreate,
    RecommendationOut,
    RecommendationOutcome,
    RecommendationReopen,
    RecommendationUpdate,
    RecommendationVerify,
    SprayFromRec,
    SprayOut,
)
from ..services.compliance import blocked as compliance_blocked
from ..services.compliance import check_spray
from ..services.etl import effective_threshold
from ..services.recommendations import outcome as compute_outcome
from ..services.spray import compose_spray


def _compliance_result(issues) -> ComplianceResult:
    return ComplianceResult(
        issues=[ComplianceIssue(level=i.level, code=i.code, message=i.message) for i in issues],
        blocked=compliance_blocked(issues),
    )

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("", response_model=list[RecommendationOut])
async def list_recommendations(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
    status_filter: str | None = Query(default=None, alias="status"),
):
    q = select(Recommendation)
    if status_filter is not None:
        q = q.where(Recommendation.status == status_filter)
    return (
        await db.execute(q.order_by(Recommendation.created_at.desc()))
    ).scalars().all()


@router.post("", response_model=RecommendationOut, status_code=status.HTTP_201_CREATED)
async def create_recommendation(
    payload: RecommendationCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Raise an intervention from an observation. Idempotent per greenhouse +
    agent: if one is already open/planned, return it instead of duplicating."""
    if payload.pest_id is None and payload.disease_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "pest_id or disease_id is required"
        )

    existing = (
        await db.execute(
            select(Recommendation)
            .where(
                Recommendation.greenhouse_id == payload.greenhouse_id,
                Recommendation.status.in_(["open", "planned"]),
                Recommendation.pest_id == payload.pest_id
                if payload.pest_id is not None
                else Recommendation.disease_id == payload.disease_id,
            )
            .order_by(Recommendation.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    note = payload.note
    if note is None:
        if payload.pest_id is not None:
            agent = await db.get(Pest, payload.pest_id)
            note = f"{agent.name if agent else 'Pest'} flagged by manager"
        else:
            agent = await db.get(Disease, payload.disease_id)
            note = f"{agent.name if agent else 'Disease'} flagged by manager"

    resolved = await effective_threshold(
        db,
        pest_id=payload.pest_id,
        disease_id=payload.disease_id,
        greenhouse_id=payload.greenhouse_id,
    )
    rec = Recommendation(
        greenhouse_id=payload.greenhouse_id,
        bed_code=payload.bed_code,
        pest_id=payload.pest_id,
        disease_id=payload.disease_id,
        trigger_severity=payload.trigger_severity,
        baseline_severity=payload.trigger_severity,
        effective_threshold=resolved.threshold,
        threshold_source=resolved.source,
        note=note,
    )
    db.add(rec)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.patch("/{rec_id}", response_model=RecommendationOut)
async def update_recommendation(
    rec_id: int,
    payload: RecommendationUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    if payload.recommended_chemical_id is not None:
        rec.recommended_chemical_id = payload.recommended_chemical_id
    if payload.note is not None:
        rec.note = payload.note
    if payload.status is not None:
        rec.status = payload.status
        if payload.status == "resolved" and rec.resolved_at is None:
            rec.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(rec)
    return rec


@router.get("/outcomes", response_model=list[RecommendationOutcome])
async def list_outcomes(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Block response (baseline → latest severity) for every live recommendation."""
    recs = (
        await db.execute(
            select(Recommendation).where(Recommendation.status != "resolved")
        )
    ).scalars().all()
    return [await compute_outcome(db, r) for r in recs]


@router.get("/{rec_id}/outcome", response_model=RecommendationOutcome)
async def rec_outcome(
    rec_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    return await compute_outcome(db, rec)


@router.post("/{rec_id}/verify", response_model=RecommendationOut)
async def verify_recommendation(
    rec_id: int,
    payload: RecommendationVerify | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Record the post-intervention reading with a reasoned outcome, and resolve
    if pressure fell below ETL."""
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    oc = await compute_outcome(db, rec)
    if oc["latest_severity"] is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "No observation to verify against yet"
        )
    sev, thr = oc["latest_severity"], oc["effective_threshold"]
    note = payload.note if payload else None
    rec.post_severity = sev
    if oc["verdict"] == "resolved_ready":
        rec.status = "resolved"
        if rec.resolved_at is None:
            rec.resolved_at = datetime.now(timezone.utc)
        rec.outcome_note = note or f"Recovered — severity {sev} < ETL {thr}"
    else:
        rec.outcome_note = note or f"Not responding — severity {sev} ≥ ETL {thr}"
    await db.commit()
    await db.refresh(rec)
    return rec


@router.post("/{rec_id}/reopen", response_model=RecommendationOut)
async def reopen_recommendation(
    rec_id: int,
    payload: RecommendationReopen | None = None,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Reopen a resolved recommendation (e.g. the problem came back)."""
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    if rec.status != "resolved":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Only resolved recommendations can be reopened"
        )
    rec.status = "open"
    rec.resolved_at = None
    rec.reopened_count = (rec.reopened_count or 0) + 1
    rec.outcome_note = (payload.reason if payload else None) or "Manually reopened"
    await db.commit()
    await db.refresh(rec)
    return rec


@router.get("/{rec_id}/compliance", response_model=ComplianceResult)
async def rec_compliance(
    rec_id: int,
    chemical_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Preview the compliance issues for spraying a chemical on this rec's block."""
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    issues = await check_spray(
        db,
        greenhouse_id=rec.greenhouse_id,
        chemical_id=chemical_id or rec.recommended_chemical_id,
        pest_id=rec.pest_id,
        disease_id=rec.disease_id,
    )
    return _compliance_result(issues)


@router.post("/{rec_id}/spray", response_model=SprayOut, status_code=status.HTTP_201_CREATED)
async def spray_from_recommendation(
    rec_id: int,
    payload: SprayFromRec,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    """Generate a costed, PHI-aware spray program from a recommendation and mark
    it actioned — screened by the compliance gate first."""
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation not found")
    chemical_id = payload.chemical_id or rec.recommended_chemical_id
    if chemical_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Assign a chemical before generating a spray"
        )

    issues = await check_spray(
        db,
        greenhouse_id=rec.greenhouse_id,
        chemical_id=chemical_id,
        pest_id=rec.pest_id,
        disease_id=rec.disease_id,
    )
    blocks = [i for i in issues if i.level == "block"]
    if blocks and not payload.override:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Blocked by compliance: " + "; ".join(i.message for i in blocks),
        )

    comments = payload.comments or rec.note
    if payload.override and blocks:
        comments = f"[Compliance override] {'; '.join(i.message for i in blocks)}" + (
            f" — {comments}" if comments else ""
        )

    record = await compose_spray(
        db,
        greenhouse_id=rec.greenhouse_id,
        chemical_id=chemical_id,
        recorded_at=datetime.now(timezone.utc),
        bed_code=rec.bed_code,
        coverage=payload.coverage,
        comments=comments,
        start_date=payload.start_date,
        recommendation_id=rec.id,
        scout_id=current.id,
    )
    db.add(record)
    rec.recommended_chemical_id = chemical_id
    if rec.status in ("open", "planned"):
        rec.status = "actioned"
    await db.commit()
    await db.refresh(record)
    return record
