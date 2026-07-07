"""Scout-quality validation — flag anomalous observations on ingest.

Catches likely fat-finger errors (e.g. severity 30 typed for a block that has
historically sat near 2) before they skew dashboard trends. Conservative: only
flags when there's enough history and the value is a clear statistical outlier.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ScoutingRecord


async def anomaly_check(db: AsyncSession, rec: ScoutingRecord) -> tuple[bool, str | None]:
    # Hard sanity bound first (severity is a 0–5 score).
    if rec.severity > 5:
        return True, f"severity {rec.severity} exceeds the 0–5 scale"
    if rec.severity <= 2 or rec.greenhouse_id is None:
        return False, None

    q = select(
        func.count().label("n"),
        func.avg(ScoutingRecord.severity).label("mean"),
        func.stddev_samp(ScoutingRecord.severity).label("sd"),
    ).where(
        ScoutingRecord.greenhouse_id == rec.greenhouse_id,
        ScoutingRecord.scouting_for == rec.scouting_for,
    )
    if rec.pest_id is not None:
        q = q.where(ScoutingRecord.pest_id == rec.pest_id)
    if rec.disease_id is not None:
        q = q.where(ScoutingRecord.disease_id == rec.disease_id)

    row = (await db.execute(q)).one()
    n = int(row.n or 0)
    mean = float(row.mean) if row.mean is not None else None
    sd = float(row.sd) if row.sd is not None else None
    if n < 6 or mean is None or sd is None or sd <= 0:
        return False, None

    ceiling = mean + 2 * sd
    if rec.severity > ceiling and rec.severity - mean >= 2:
        return True, (
            f"severity {rec.severity} far above block/pest norm "
            f"(mean {mean:.1f}, +2σ {ceiling:.1f})"
        )
    return False, None
