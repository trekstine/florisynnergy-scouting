"""Analytics services for generating summary statistics and trends from scouting and spray records.

A filterable read layer over scouting/spray records: KPI summary with
period-over-period deltas, daily trends, dimensional breakdowns, severity
distribution, per-greenhouse and per-bed pressure, pest matrix, scout
accountability, and spray cost.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Select, and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..geo import centroid, geometry_to_coords
from ..models import (
    Disease,
    Employee,
    Greenhouse,
    Pest,
    Recommendation,
    ScoutingRecord,
    SprayRecord,
)
from ..schemas import (
    AnalyticsSummary,
    BedPressure,
    BreakdownRow,
    GreenhousePressure,
    KpiDelta,
    ObservationPoint,
    PestMatrixCell,
    ScoutSummary,
    SeverityBucket,
    SprayCostRow,
    TrendPoint,
)


@dataclass
class Filters:
    start: date | None = None
    end: date | None = None
    greenhouse_id: int | None = None
    pest_id: int | None = None
    disease_id: int | None = None
    variety_code: str | None = None
    scouting_for: str | None = None

    def _dt_bounds(self) -> tuple[datetime | None, datetime | None]:
        s = (
            datetime.combine(self.start, time.min, tzinfo=timezone.utc)
            if self.start
            else None
        )
        e = (
            datetime.combine(self.end, time.max, tzinfo=timezone.utc)
            if self.end
            else None
        )
        return s, e

    def apply(self, q: Select) -> Select:
        s, e = self._dt_bounds()
        if s is not None:
            q = q.where(ScoutingRecord.recorded_at >= s)
        if e is not None:
            q = q.where(ScoutingRecord.recorded_at <= e)
        if self.greenhouse_id is not None:
            q = q.where(ScoutingRecord.greenhouse_id == self.greenhouse_id)
        if self.pest_id is not None:
            q = q.where(ScoutingRecord.pest_id == self.pest_id)
        if self.disease_id is not None:
            q = q.where(ScoutingRecord.disease_id == self.disease_id)
        if self.variety_code is not None:
            q = q.where(ScoutingRecord.variety_code == self.variety_code)
        if self.scouting_for is not None:
            q = q.where(ScoutingRecord.scouting_for == self.scouting_for)
        return q


def _band(max_sev: int, over: int) -> str:
    if max_sev <= 0:
        return "none"
    if over > 0 or max_sev >= 4:
        return "high"
    if max_sev >= 3:
        return "medium"
    return "low"


def _pct(curr: float, prev: float) -> float | None:
    if prev == 0:
        return None
    return round((curr - prev) / prev * 100, 1)


# ───────────────────────────── Summary (KPIs) ───────────────────────────────
async def summary(db: AsyncSession, f: Filters) -> AnalyticsSummary:
    end = f.end or date.today()
    start = f.start or (end - timedelta(days=29))
    span = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=span - 1)

    async def window(s: date, e: date) -> dict[str, float]:
        wf = Filters(s, e, f.greenhouse_id, f.pest_id, f.scouting_for)
        row = (
            await db.execute(
                wf.apply(
                    select(
                        func.count().label("records"),
                        func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg"),
                        func.coalesce(func.sum(ScoutingRecord.beneficials_count), 0).label("ben"),
                    )
                )
            )
        ).one()
        over = (
            await db.execute(
                wf.apply(
                    select(func.count())
                    .select_from(ScoutingRecord)
                    .join(Pest, Pest.id == ScoutingRecord.pest_id, isouter=True)
                    .where(ScoutingRecord.severity >= func.coalesce(Pest.threshold, 3))
                )
            )
        ).scalar_one()
        scouts = (
            await db.execute(
                wf.apply(
                    select(func.count(func.distinct(ScoutingRecord.scout_id)))
                )
            )
        ).scalar_one()
        return {
            "records": float(row.records),
            "avg": round(float(row.avg), 2),
            "over": float(over),
            "ben": float(row.ben),
            "scouts": float(scouts),
        }

    cur = await window(start, end)
    prev = await window(prev_start, prev_end)

    # Spray cost in window (and previous).
    async def spray_window(s: date, e: date) -> float:
        c = (
            await db.execute(
                select(func.coalesce(func.sum(SprayRecord.cost_of_chemical), 0)).where(
                    SprayRecord.recorded_at
                    >= datetime.combine(s, time.min, tzinfo=timezone.utc),
                    SprayRecord.recorded_at
                    <= datetime.combine(e, time.max, tzinfo=timezone.utc),
                    *(
                        [SprayRecord.greenhouse_id == f.greenhouse_id]
                        if f.greenhouse_id is not None
                        else []
                    ),
                )
            )
        ).scalar_one()
        return float(c)

    cur_cost = await spray_window(start, end)
    prev_cost = await spray_window(prev_start, prev_end)

    open_recs = (
        await db.execute(
            select(func.count()).select_from(Recommendation).where(
                Recommendation.status.in_(["open", "planned"])
            )
        )
    ).scalar_one()

    by_type_rows = (
        await db.execute(
            f.apply(
                select(ScoutingRecord.scouting_for, func.count()).group_by(
                    ScoutingRecord.scouting_for
                )
            )
        )
    ).all()
    by_type = {k: int(v) for k, v in by_type_rows}

    def kd(c: float, p: float) -> KpiDelta:
        return KpiDelta(value=c, previous=p, delta_pct=_pct(c, p))

    return AnalyticsSummary(
        start=start,
        end=end,
        records=kd(cur["records"], prev["records"]),
        avg_severity=kd(cur["avg"], prev["avg"]),
        over_threshold=kd(cur["over"], prev["over"]),
        open_recommendations=int(open_recs),
        active_scouts=kd(cur["scouts"], prev["scouts"]),
        spray_cost=kd(cur_cost, prev_cost),
        beneficials=int(cur["ben"]),
        by_type=by_type,
    )


# ───────────────────────────── Trend (time series) ──────────────────────────
async def trend(db: AsyncSession, f: Filters) -> list[TrendPoint]:
    end = f.end or date.today()
    start = f.start or (end - timedelta(days=29))
    day = func.date_trunc("day", ScoutingRecord.recorded_at).label("d")
    rows = (
        await db.execute(
            Filters(start, end, f.greenhouse_id, f.pest_id, f.scouting_for)
            .apply(
                select(
                    day,
                    func.count().label("records"),
                    func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg"),
                )
            )
            .group_by(day)
            .order_by(day)
        )
    ).all()
    over_rows = (
        await db.execute(
            Filters(start, end, f.greenhouse_id, f.pest_id, f.scouting_for)
            .apply(
                select(day, func.count().label("n"))
                .select_from(ScoutingRecord)
                .join(Pest, Pest.id == ScoutingRecord.pest_id, isouter=True)
                .where(ScoutingRecord.severity >= func.coalesce(Pest.threshold, 3))
            )
            .group_by(day)
        )
    ).all()
    over_by_day = {r.d.date(): int(r.n) for r in over_rows}

    found = {
        r.d.date(): (int(r.records), round(float(r.avg), 2)) for r in rows
    }
    # Dense series (fill gaps with zeros) so charts read correctly.
    out: list[TrendPoint] = []
    d = start
    while d <= end:
        rec, avg = found.get(d, (0, 0.0))
        out.append(
            TrendPoint(date=d, records=rec, avg_severity=avg, over_threshold=over_by_day.get(d, 0))
        )
        d += timedelta(days=1)
    return out


# ───────────────────────────── Breakdown (by dim) ───────────────────────────
async def breakdown(db: AsyncSession, dim: str, f: Filters, limit: int = 12) -> list[BreakdownRow]:
    over_expr = func.sum(case((ScoutingRecord.severity >= 3, 1), else_=0))
    base = select(
        func.count().label("records"),
        func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg"),
        func.coalesce(over_expr, 0).label("over"),
    )

    if dim == "pest":
        q = f.apply(base.add_columns(Pest.name.label("k"))).join(
            Pest, Pest.id == ScoutingRecord.pest_id
        ).group_by(Pest.name)
    elif dim == "disease":
        q = f.apply(base.add_columns(Disease.name.label("k"))).join(
            Disease, Disease.id == ScoutingRecord.disease_id
        ).group_by(Disease.name)
    elif dim == "variety":
        q = f.apply(base.add_columns(ScoutingRecord.variety_code.label("k"))).group_by(
            ScoutingRecord.variety_code
        )
    elif dim == "type":
        q = f.apply(base.add_columns(ScoutingRecord.scouting_for.label("k"))).group_by(
            ScoutingRecord.scouting_for
        )
    elif dim == "greenhouse":
        q = f.apply(base.add_columns(Greenhouse.name.label("k"))).join(
            Greenhouse, Greenhouse.id == ScoutingRecord.greenhouse_id
        ).group_by(Greenhouse.name)
    else:
        return []

    rows = (await db.execute(q.order_by(func.count().desc()).limit(limit))).all()
    return [
        BreakdownRow(
            key=str(r.k) if r.k is not None else "—",
            records=int(r.records),
            avg_severity=round(float(r.avg), 2),
            over_threshold=int(r.over),
        )
        for r in rows
    ]


async def severity_distribution(db: AsyncSession, f: Filters) -> list[SeverityBucket]:
    rows = (
        await db.execute(
            f.apply(
                select(ScoutingRecord.severity, func.count()).group_by(
                    ScoutingRecord.severity
                )
            )
        )
    ).all()
    counts = {int(s): int(c) for s, c in rows}
    return [SeverityBucket(severity=i, count=counts.get(i, 0)) for i in range(6)]


# ───────────────────────────── Pressure (map) ───────────────────────────────
async def greenhouse_pressure(db: AsyncSession, f: Filters) -> list[GreenhousePressure]:
    greenhouses = (await db.execute(select(Greenhouse).order_by(Greenhouse.id))).scalars().all()

    agg = (
        await db.execute(
            f.apply(
                select(
                    ScoutingRecord.greenhouse_id,
                    func.count().label("records"),
                    func.coalesce(func.max(ScoutingRecord.severity), 0).label("max_sev"),
                    func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg_sev"),
                ).group_by(ScoutingRecord.greenhouse_id)
            )
        )
    ).all()
    by_gh = {row.greenhouse_id: row for row in agg}

    over_rows = (
        await db.execute(
            f.apply(
                select(ScoutingRecord.greenhouse_id, func.count().label("n"))
                .select_from(ScoutingRecord)
                .join(Pest, Pest.id == ScoutingRecord.pest_id, isouter=True)
                .where(ScoutingRecord.severity >= func.coalesce(Pest.threshold, 3))
                .group_by(ScoutingRecord.greenhouse_id)
            )
        )
    ).all()
    over_by_gh = {r.greenhouse_id: r.n for r in over_rows}

    out: list[GreenhousePressure] = []
    for gh in greenhouses:
        coords = geometry_to_coords(gh.boundary)
        row = by_gh.get(gh.id)
        records = int(row.records) if row else 0
        max_sev = int(row.max_sev) if row else 0
        avg_sev = round(float(row.avg_sev), 2) if row else 0.0
        over = int(over_by_gh.get(gh.id, 0))
        out.append(
            GreenhousePressure(
                greenhouse_id=gh.id,
                name=gh.name,
                centroid=centroid([(c[0], c[1]) for c in coords]),
                boundary=coords,
                records=records,
                max_severity=max_sev,
                avg_severity=avg_sev,
                over_threshold=over,
                pressure=_band(max_sev, over),
            )
        )
    return out


async def observation_points(db: AsyncSession, f: Filters, limit: int = 8000) -> list[ObservationPoint]:
    """Geolocated scouting observations for the heat layer (weighted by severity)."""
    rows = (
        await db.execute(
            f.apply(
                select(
                    ScoutingRecord.gps_lat,
                    ScoutingRecord.gps_lng,
                    ScoutingRecord.severity,
                    ScoutingRecord.scouting_for,
                    ScoutingRecord.greenhouse_id,
                ).where(
                    ScoutingRecord.gps_lat.is_not(None),
                    ScoutingRecord.gps_lng.is_not(None),
                )
            ).limit(limit)
        )
    ).all()
    return [
        ObservationPoint(
            lat=float(r.gps_lat),
            lng=float(r.gps_lng),
            severity=int(r.severity),
            scouting_for=r.scouting_for,
            greenhouse_id=r.greenhouse_id,
        )
        for r in rows
    ]


async def bed_pressure(db: AsyncSession, greenhouse_id: int, f: Filters) -> list[BedPressure]:
    gf = Filters(f.start, f.end, greenhouse_id, f.pest_id, f.scouting_for)
    rows = (
        await db.execute(
            gf.apply(
                select(
                    ScoutingRecord.bed_code,
                    func.count().label("records"),
                    func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg"),
                    func.coalesce(func.max(ScoutingRecord.severity), 0).label("max"),
                )
                .where(ScoutingRecord.bed_code.is_not(None))
                .group_by(ScoutingRecord.bed_code)
                .order_by(ScoutingRecord.bed_code)
            )
        )
    ).all()
    out: list[BedPressure] = []
    for r in rows:
        max_sev = int(r.max)
        over = 1 if max_sev >= 3 else 0
        out.append(
            BedPressure(
                bed_code=r.bed_code,
                records=int(r.records),
                avg_severity=round(float(r.avg), 2),
                max_severity=max_sev,
                over_threshold=over,
                pressure=_band(max_sev, over),
            )
        )
    return out


# ───────────────────────────── Pest matrix ──────────────────────────────────
async def pest_matrix(db: AsyncSession, f: Filters) -> list[PestMatrixCell]:
    rows = (
        await db.execute(
            f.apply(
                select(
                    Pest.name.label("pest"),
                    Greenhouse.name.label("gh"),
                    func.count().label("records"),
                    func.avg(ScoutingRecord.severity).label("avg_sev"),
                )
                .select_from(ScoutingRecord)
                .join(Pest, Pest.id == ScoutingRecord.pest_id)
                .join(Greenhouse, Greenhouse.id == ScoutingRecord.greenhouse_id)
                .group_by(Pest.name, Greenhouse.name)
            ).order_by(Pest.name, Greenhouse.name)
        )
    ).all()
    return [
        PestMatrixCell(
            pest=r.pest,
            greenhouse=r.gh,
            records=int(r.records),
            avg_severity=round(float(r.avg_sev or 0), 2),
        )
        for r in rows
    ]


# ───────────────────────────── Scouts ───────────────────────────────────────
async def scout_summary(db: AsyncSession, f: Filters) -> list[ScoutSummary]:
    q = (
        select(
            Employee.id,
            Employee.name,
            func.count(ScoutingRecord.id).label("records"),
            func.count(func.distinct(ScoutingRecord.greenhouse_id)).label("ghs"),
            func.max(ScoutingRecord.recorded_at).label("last_seen"),
        )
        .select_from(Employee)
        .join(ScoutingRecord, ScoutingRecord.scout_id == Employee.id, isouter=True)
        .where(Employee.role == "scout")
        .group_by(Employee.id, Employee.name)
        .order_by(func.count(ScoutingRecord.id).desc())
    )
    s, e = f._dt_bounds()
    conds = []
    if s is not None:
        conds.append(ScoutingRecord.recorded_at >= s)
    if e is not None:
        conds.append(ScoutingRecord.recorded_at <= e)
    if conds:
        # Apply window inside the outer join so scouts with 0 records still show.
        q = (
            select(
                Employee.id,
                Employee.name,
                func.count(ScoutingRecord.id).label("records"),
                func.count(func.distinct(ScoutingRecord.greenhouse_id)).label("ghs"),
                func.max(ScoutingRecord.recorded_at).label("last_seen"),
            )
            .select_from(Employee)
            .join(
                ScoutingRecord,
                and_(ScoutingRecord.scout_id == Employee.id, *conds),
                isouter=True,
            )
            .where(Employee.role == "scout")
            .group_by(Employee.id, Employee.name)
            .order_by(func.count(ScoutingRecord.id).desc())
        )
    rows = (await db.execute(q)).all()
    return [
        ScoutSummary(
            scout_id=r.id,
            name=r.name,
            records=int(r.records),
            greenhouses_visited=int(r.ghs),
            last_seen=r.last_seen,
        )
        for r in rows
    ]


# ───────────────────────────── Spray cost ───────────────────────────────────
async def spray_cost(db: AsyncSession) -> list[SprayCostRow]:
    rows = (
        await db.execute(
            select(
                Greenhouse.name.label("gh"),
                func.count(func.distinct(SprayRecord.program_id)).label("programs"),
                func.count(SprayRecord.id).label("products"),
                func.coalesce(func.sum(SprayRecord.cost_of_chemical), 0).label("cost"),
            )
            .select_from(SprayRecord)
            .join(Greenhouse, Greenhouse.id == SprayRecord.greenhouse_id, isouter=True)
            .group_by(Greenhouse.name)
            .order_by(func.coalesce(func.sum(SprayRecord.cost_of_chemical), 0).desc())
        )
    ).all()
    return [
        SprayCostRow(
            greenhouse=r.gh or "—",
            programs=int(r.programs),
            products=int(r.products),
            total_cost=round(float(r.cost), 2),
        )
        for r in rows
    ]
