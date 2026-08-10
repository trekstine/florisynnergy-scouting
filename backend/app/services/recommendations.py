"""Threshold → recommendation engine.

Two triggers, per the Interplant scouting model — always evaluated per agent,
never blended across pests/diseases:

* **ETL breach** — the entry's severity meets or exceeds the *effective* ETL
  (resolved through variety/greenhouse override rules).
* **Hotspot** — any single observation at/above severity 4 fires immediately,
  even when the agent's block-wide pressure is otherwise low. A pressure index
  of 0.2 must not hide a severity-4 bed.

Either way, only one open recommendation per greenhouse + agent.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Disease, Pest, Recommendation, ScoutingRecord
from .analytics import bed_phrase
from .etl import effective_threshold

# One observation at/above this severity is an immediate hotspot, regardless
# of the agent's configured ETL. Mirrors HOTSPOT_SEVERITY in analytics.
HOTSPOT_SEVERITY = 4


async def evaluate_entry(db: AsyncSession, rec: ScoutingRecord) -> bool:
    """Create a recommendation if this entry breaches its effective threshold
    or is a hotspot. Returns True if one was created. Caller owns the commit."""
    if rec.greenhouse_id is None or rec.severity <= 0:
        return False

    is_hotspot = rec.severity >= HOTSPOT_SEVERITY

    if rec.scouting_for in ("pest", "lure", "sticky_trap") and rec.pest_id:
        resolved = await effective_threshold(
            db, pest_id=rec.pest_id, variety_id=rec.variety_id, greenhouse_id=rec.greenhouse_id
        )
        if rec.severity < resolved.threshold and not is_hotspot:
            return False
        if await _open_for(db, rec.greenhouse_id, pest_id=rec.pest_id):
            return False
        pest = await db.get(Pest, rec.pest_id)
        name = pest.name if pest else "Pest"
        scope = "" if resolved.source == "default" else f" [{resolved.source} ETL]"
        if is_hotspot and rec.severity < resolved.threshold:
            where = bed_phrase(rec.bed_code)
            note = f"Hotspot — {name} severity {rec.severity} detected{where}"
        else:
            note = f"{name} {rec.severity} ≥ ETL {resolved.threshold}{scope}"
        db.add(
            Recommendation(
                greenhouse_id=rec.greenhouse_id,
                bed_code=rec.bed_code,
                pest_id=rec.pest_id,
                trigger_severity=rec.severity,
                baseline_severity=rec.severity,
                effective_threshold=resolved.threshold,
                threshold_source="hotspot" if is_hotspot and rec.severity < resolved.threshold else resolved.source,
                note=note,
                # Dated to the observation, not to wall-clock. A batch that
                # syncs days after a scout walked the block must still place
                # the recommendation on the day the pressure was seen —
                # otherwise every follow-up scout looks like it predates the
                # recommendation and the outcome loop never fires.
                created_at=rec.recorded_at,
            )
        )
        return True

    if rec.scouting_for == "disease" and rec.disease_id:
        resolved = await effective_threshold(
            db, disease_id=rec.disease_id, variety_id=rec.variety_id, greenhouse_id=rec.greenhouse_id
        )
        if rec.severity < resolved.threshold and not is_hotspot:
            return False
        if await _open_for(db, rec.greenhouse_id, disease_id=rec.disease_id):
            return False
        disease = await db.get(Disease, rec.disease_id)
        name = disease.name if disease else "Disease"
        scope = "" if resolved.source == "default" else f" [{resolved.source} ETL]"
        if is_hotspot and rec.severity < resolved.threshold:
            where = bed_phrase(rec.bed_code)
            note = f"Hotspot — {name} severity {rec.severity} detected{where}"
        else:
            note = f"{name} {rec.severity} ≥ ETL {resolved.threshold}{scope}"
        db.add(
            Recommendation(
                greenhouse_id=rec.greenhouse_id,
                bed_code=rec.bed_code,
                disease_id=rec.disease_id,
                trigger_severity=rec.severity,
                baseline_severity=rec.severity,
                effective_threshold=resolved.threshold,
                threshold_source="hotspot" if is_hotspot and rec.severity < resolved.threshold else resolved.source,
                note=note,
                # Dated to the observation, not to wall-clock. A batch that
                # syncs days after a scout walked the block must still place
                # the recommendation on the day the pressure was seen —
                # otherwise every follow-up scout looks like it predates the
                # recommendation and the outcome loop never fires.
                created_at=rec.recorded_at,
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


def _agent_filter(q, rec: Recommendation):
    """Narrow a ScoutingRecord query to the same block + agent as ``rec``."""
    q = q.where(ScoutingRecord.greenhouse_id == rec.greenhouse_id)
    if rec.pest_id is not None:
        return q.where(ScoutingRecord.pest_id == rec.pest_id)
    if rec.disease_id is not None:
        return q.where(ScoutingRecord.disease_id == rec.disease_id)
    return q


async def outcome(db: AsyncSession, rec: Recommendation) -> dict:
    """Assess how the block has responded since this recommendation was raised.

    ``latest_severity`` is the most recent reading of the same agent in the same
    block; ``observations_since`` counts genuine re-scouts (after the rec)."""
    resolved = await effective_threshold(
        db, pest_id=rec.pest_id, disease_id=rec.disease_id, greenhouse_id=rec.greenhouse_id
    )
    latest = (
        await db.execute(
            _agent_filter(
                select(ScoutingRecord.severity, ScoutingRecord.recorded_at), rec
            ).order_by(ScoutingRecord.recorded_at.desc()).limit(1)
        )
    ).first()
    since = (
        await db.execute(
            _agent_filter(select(func.count()).select_from(ScoutingRecord), rec).where(
                ScoutingRecord.recorded_at > rec.created_at
            )
        )
    ).scalar_one()

    latest_sev = int(latest.severity) if latest else None
    base = rec.baseline_severity
    if latest_sev is None:
        verdict = "no_data"
    elif latest_sev < resolved.threshold:
        verdict = "resolved_ready"
    elif base is not None and latest_sev < base:
        verdict = "recovering"
    else:
        verdict = "not_responding"

    return {
        "recommendation_id": rec.id,
        "baseline_severity": base,
        "latest_severity": latest_sev,
        "latest_observed_at": latest.recorded_at if latest else None,
        "observations_since": int(since or 0),
        "effective_threshold": resolved.threshold,
        "delta": (latest_sev - base) if (latest_sev is not None and base is not None) else None,
        "verdict": verdict,
    }


async def evaluate_outcome(db: AsyncSession, entry: ScoutingRecord) -> bool:
    """Auto-drive the loop from a re-scout:

    * an **actioned** rec resolves if pressure fell below ETL, else records that
      it's not responding;
    * a **resolved** rec **reopens** if the same agent breaches ETL again — a
      recurrence — so recurring problems don't silently disappear.
    Either way the recommendation carries a reasoned outcome note."""
    if entry.greenhouse_id is None or (entry.pest_id is None and entry.disease_id is None):
        return False
    q = select(Recommendation).where(
        Recommendation.greenhouse_id == entry.greenhouse_id,
        Recommendation.status.in_(["actioned", "resolved"]),
    )
    if entry.pest_id is not None:
        q = q.where(Recommendation.pest_id == entry.pest_id)
    else:
        q = q.where(Recommendation.disease_id == entry.disease_id)
    rec = (
        await db.execute(q.order_by(Recommendation.created_at.desc()).limit(1))
    ).scalar_one_or_none()
    if rec is None:
        return False

    resolved = await effective_threshold(
        db, pest_id=rec.pest_id, disease_id=rec.disease_id, greenhouse_id=rec.greenhouse_id
    )

    if rec.status == "actioned":
        if entry.recorded_at <= rec.created_at:
            return False
        rec.post_severity = entry.severity
        if entry.severity < resolved.threshold:
            rec.status = "resolved"
            rec.resolved_at = datetime.now(timezone.utc)
            rec.outcome_note = (
                f"Recovered — severity {entry.severity} < ETL {resolved.threshold} after intervention"
            )
        else:
            rec.outcome_note = (
                f"Not responding — severity {entry.severity} ≥ ETL {resolved.threshold} after intervention"
            )
        return True

    # status == "resolved": watch for recurrence.
    if rec.resolved_at is not None and entry.recorded_at <= rec.resolved_at:
        return False
    if entry.severity >= resolved.threshold:
        rec.status = "open"
        rec.resolved_at = None
        rec.post_severity = entry.severity
        rec.reopened_count = (rec.reopened_count or 0) + 1
        rec.outcome_note = (
            f"Recurrence — severity {entry.severity} ≥ ETL {resolved.threshold} returned after resolution"
        )
        return True
    return False
