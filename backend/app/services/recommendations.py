"""Threshold → recommendation engine.

When a scouting entry's severity meets or exceeds the *effective* ETL (resolved
through variety/greenhouse override rules), an open intervention recommendation
is raised — unless one is already open for that greenhouse + agent.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Disease, Pest, Recommendation, ScoutingRecord
from .etl import effective_threshold


async def evaluate_entry(db: AsyncSession, rec: ScoutingRecord) -> bool:
    """Create a recommendation if this entry breaches its effective threshold.
    Returns True if one was created. Caller owns the commit."""
    if rec.greenhouse_id is None or rec.severity <= 0:
        return False

    if rec.scouting_for in ("pest", "lure", "sticky_trap") and rec.pest_id:
        resolved = await effective_threshold(
            db, pest_id=rec.pest_id, variety_id=rec.variety_id, greenhouse_id=rec.greenhouse_id
        )
        if rec.severity < resolved.threshold:
            return False
        if await _open_for(db, rec.greenhouse_id, pest_id=rec.pest_id):
            return False
        pest = await db.get(Pest, rec.pest_id)
        scope = "" if resolved.source == "default" else f" [{resolved.source} ETL]"
        db.add(
            Recommendation(
                greenhouse_id=rec.greenhouse_id,
                bed_code=rec.bed_code,
                pest_id=rec.pest_id,
                trigger_severity=rec.severity,
                baseline_severity=rec.severity,
                note=f"{pest.name if pest else 'Pest'} {rec.severity} ≥ ETL {resolved.threshold}{scope}",
            )
        )
        return True

    if rec.scouting_for == "disease" and rec.disease_id:
        resolved = await effective_threshold(
            db, disease_id=rec.disease_id, variety_id=rec.variety_id, greenhouse_id=rec.greenhouse_id
        )
        if rec.severity < resolved.threshold:
            return False
        if await _open_for(db, rec.greenhouse_id, disease_id=rec.disease_id):
            return False
        disease = await db.get(Disease, rec.disease_id)
        scope = "" if resolved.source == "default" else f" [{resolved.source} ETL]"
        db.add(
            Recommendation(
                greenhouse_id=rec.greenhouse_id,
                bed_code=rec.bed_code,
                disease_id=rec.disease_id,
                trigger_severity=rec.severity,
                baseline_severity=rec.severity,
                note=f"{disease.name if disease else 'Disease'} {rec.severity} ≥ ETL {resolved.threshold}{scope}",
            )
        )
        return True

    return False


async def _open_for(
    db: AsyncSession,
    greenhouse_id: int,
    *,
    pest_id: int | None = None,
    disease_id: int | None = None,
) -> bool:
    q = select(Recommendation.id).where(
        Recommendation.greenhouse_id == greenhouse_id,
        Recommendation.status.in_(["open", "planned"]),
    )
    if pest_id is not None:
        q = q.where(Recommendation.pest_id == pest_id)
    if disease_id is not None:
        q = q.where(Recommendation.disease_id == disease_id)
    return (await db.execute(q.limit(1))).first() is not None
