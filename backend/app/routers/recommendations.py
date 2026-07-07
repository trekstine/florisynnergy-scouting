"""Intervention recommendations."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import require_roles
from ..models import Disease, Pest, Recommendation
from ..schemas import RecommendationCreate, RecommendationOut, RecommendationUpdate

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

    rec = Recommendation(
        greenhouse_id=payload.greenhouse_id,
        bed_code=payload.bed_code,
        pest_id=payload.pest_id,
        disease_id=payload.disease_id,
        trigger_severity=payload.trigger_severity,
        baseline_severity=payload.trigger_severity,
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
