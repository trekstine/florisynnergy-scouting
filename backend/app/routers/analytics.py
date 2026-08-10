"""Analytics endpoints for the portal dashboards (filterable)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import require_roles
from ..schemas import (
    AgentPressure,
    AgentTrendPoint,
    AnalyticsSummary,
    BedPressure,
    BreakdownRow,
    GreenhousePressure,
    ObservationPoint,
    PestMatrixCell,
    ScoutMovement,
    ScoutSummary,
    SeverityBucket,
    SprayCostRow,
    TrendPoint,
)
from ..services import analytics
from ..services.analytics import Filters

router = APIRouter(prefix="/analytics", tags=["analytics"])

Manager = Depends(require_roles("admin", "supervisor"))


def _filters(
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    greenhouse_id: int | None = Query(default=None),
    pest_id: int | None = Query(default=None),
    disease_id: int | None = Query(default=None),
    variety_code: str | None = Query(default=None),
    scout_id: int | None = Query(default=None),
    scouting_for: str | None = Query(default=None),
) -> Filters:
    # Keyword args — Filters gained fields in the middle, so positional
    # construction would silently mis-map them.
    return Filters(
        start=start,
        end=end,
        greenhouse_id=greenhouse_id,
        pest_id=pest_id,
        disease_id=disease_id,
        variety_code=variety_code,
        scout_id=scout_id,
        scouting_for=scouting_for,
    )


@router.get("/summary", response_model=AnalyticsSummary)
async def summary(db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager):
    return await analytics.summary(db, f)


@router.get("/trend", response_model=list[TrendPoint])
async def trend(db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager):
    return await analytics.trend(db, f)


@router.get("/breakdown", response_model=list[BreakdownRow])
async def breakdown(
    db: AsyncSession = Depends(get_db),
    f: Filters = Depends(_filters),
    dim: str = Query(default="pest", pattern="^(pest|disease|variety|type|greenhouse)$"),
    limit: int = Query(default=12, le=50),
    _=Manager,
):
    return await analytics.breakdown(db, dim, f, limit)


@router.get("/severity-distribution", response_model=list[SeverityBucket])
async def severity_distribution(
    db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager
):
    return await analytics.severity_distribution(db, f)


@router.get("/pressure", response_model=list[GreenhousePressure])
async def pressure(db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager):
    return await analytics.greenhouse_pressure(db, f)


@router.get("/agent-trend", response_model=list[AgentTrendPoint])
async def agent_trend(
    db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager
):
    """Daily severity per pest and per disease — one series per agent."""
    return await analytics.agent_trend(db, f)


@router.get("/agent-pressure", response_model=list[AgentPressure])
async def agent_pressure(
    db: AsyncSession = Depends(get_db),
    f: Filters = Depends(_filters),
    greenhouse_id: int | None = Query(default=None),
    _=Manager,
):
    """Per-agent pressure indices — pests and diseases never blended."""
    return await analytics.agent_pressure(db, f, greenhouse_id)


@router.get("/points", response_model=list[ObservationPoint])
async def points(db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager):
    return await analytics.observation_points(db, f)


@router.get("/bed-pressure", response_model=list[BedPressure])
async def bed_pressure(
    greenhouse_id: int,
    db: AsyncSession = Depends(get_db),
    f: Filters = Depends(_filters),
    _=Manager,
):
    return await analytics.bed_pressure(db, greenhouse_id, f)


@router.get("/pest-matrix", response_model=list[PestMatrixCell])
async def pest_matrix(db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager):
    return await analytics.pest_matrix(db, f)


@router.get("/scouts", response_model=list[ScoutSummary])
async def scouts(db: AsyncSession = Depends(get_db), f: Filters = Depends(_filters), _=Manager):
    return await analytics.scout_summary(db, f)


# The path param is deliberately *not* called `scout_id`: the shared _filters
# dependency already declares one as a query param, and FastAPI refuses to
# resolve the same name as both a path and a query parameter.
@router.get("/scouts/{employee_id}/movement", response_model=ScoutMovement)
async def scout_movement(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    f: Filters = Depends(_filters),
    _=Manager,
):
    """Bed-by-bed walk for one scout, with dwell time per bed."""
    try:
        return await analytics.scout_movement(db, f, employee_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/spray-cost", response_model=list[SprayCostRow])
async def spray_cost(db: AsyncSession = Depends(get_db), _=Manager):
    return await analytics.spray_cost(db)
