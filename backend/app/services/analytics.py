"""Analytics services for generating summary statistics and trends from scouting and spray records.

A filterable read layer over scouting/spray records: KPI summary with
period-over-period deltas, daily trends, dimensional breakdowns, severity
distribution, per-greenhouse and per-bed pressure, pest matrix, scout
accountability, and spray cost.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import Select, and_, case, distinct, func, select
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
    Variety,
)
from ..schemas import (
    AgentPressure,
    AgentTrendPoint,
    AnalyticsSummary,
    BedPressure,
    BreakdownRow,
    GreenhousePressure,
    KpiDelta,
    MovementDay,
    MovementStop,
    ObservationPoint,
    PestMatrixCell,
    ScoutMovement,
    ScoutSummary,
    SeverityBucket,
    SprayCostRow,
    TrendPoint,
)

# A single observation at/above this severity is an immediate hotspot alert,
# regardless of how diluted the block-wide pressure index is.
HOTSPOT_SEVERITY = 4


@dataclass
class Filters:
    start: date | None = None
    end: date | None = None
    greenhouse_id: int | None = None
    pest_id: int | None = None
    disease_id: int | None = None
    variety_code: str | None = None
    scout_id: int | None = None
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
        if self.scout_id is not None:
            q = q.where(ScoutingRecord.scout_id == self.scout_id)
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
        wf = Filters(**{**f.__dict__, 'start': s, 'end': e})
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
            Filters(**{**f.__dict__, 'start': start, 'end': end})
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
            Filters(**{**f.__dict__, 'start': start, 'end': end})
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
    # Beds are surfaced on hover so a count leads somewhere actionable.
    # Nulls and ordering are handled in Python — combining DISTINCT with
    # ORDER BY and FILTER inside one aggregate is needlessly brittle.
    beds_expr = func.array_agg(distinct(ScoutingRecord.bed_code))
    base = select(
        func.count().label("records"),
        func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg"),
        func.coalesce(over_expr, 0).label("over"),
        beds_expr.label("beds"),
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
        # Report the variety's real name, falling back to the code when a
        # record references a variety that is not in the reference table.
        q = (
            f.apply(
                base.add_columns(
                    func.coalesce(Variety.name, ScoutingRecord.variety_code).label("k")
                )
            )
            .join(Variety, Variety.code == ScoutingRecord.variety_code, isouter=True)
            .group_by(func.coalesce(Variety.name, ScoutingRecord.variety_code))
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
            beds=sorted(b for b in (r.beds or []) if b),
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


# ───────────────────────── Per-agent pressure (Interplant model) ─────────────
async def agent_pressure(
    db: AsyncSession, f: Filters, greenhouse_id: int | None = None
) -> list[AgentPressure]:
    """Per-greenhouse, per-agent pressure — never blended across agents.

    Pressure Index = Σ(per-bed severity for that agent) ÷ beds scouted, where
    the denominator is *all* distinct beds visited in the block during the
    window (any agent), so beds where this agent wasn't seen count as 0.
    Repeat visits to the same bed use the worst observation, not the sum.
    """
    ff = Filters(**{**f.__dict__, "greenhouse_id": greenhouse_id or f.greenhouse_id})

    rows = (
        await db.execute(
            ff.apply(
                select(
                    ScoutingRecord.greenhouse_id,
                    ScoutingRecord.pest_id,
                    ScoutingRecord.disease_id,
                    ScoutingRecord.bed_code,
                    ScoutingRecord.severity,
                ).where(ScoutingRecord.greenhouse_id.is_not(None))
            )
        )
    ).all()
    if not rows:
        return []

    # Denominator per block: distinct beds visited by anyone, for anything.
    beds_scouted: dict[int, set[str]] = defaultdict(set)
    for r in rows:
        if r.bed_code:
            beds_scouted[r.greenhouse_id].add(r.bed_code)

    # Per (block, agent, bed): worst severity in the window.
    per_bed: dict[tuple[int, str, int], dict[str, int]] = defaultdict(dict)
    rec_count: dict[tuple[int, str, int], int] = defaultdict(int)
    for r in rows:
        if r.pest_id is not None:
            key = (r.greenhouse_id, "pest", r.pest_id)
        elif r.disease_id is not None:
            key = (r.greenhouse_id, "disease", r.disease_id)
        else:
            continue
        rec_count[key] += 1
        bed = r.bed_code or "—"
        sev = int(r.severity)
        if sev > per_bed[key].get(bed, -1):
            per_bed[key][bed] = sev

    pests = {p.id: p for p in (await db.execute(select(Pest))).scalars().all()}
    diseases = {d.id: d for d in (await db.execute(select(Disease))).scalars().all()}

    out: list[AgentPressure] = []
    for (gh_id, kind, agent_id), beds in per_bed.items():
        ref = pests.get(agent_id) if kind == "pest" else diseases.get(agent_id)
        name = ref.name if ref else f"#{agent_id}"
        p_thr = float(ref.pressure_threshold) if ref else 0.5

        denominator = max(len(beds_scouted.get(gh_id, set())), 1)
        total = sum(beds.values())
        index = round(total / denominator, 3)
        worst_bed, max_sev = max(beds.items(), key=lambda kv: kv[1])

        over = index >= p_thr
        hot = max_sev >= HOTSPOT_SEVERITY
        out.append(
            AgentPressure(
                greenhouse_id=gh_id,
                agent_kind=kind,  # type: ignore[arg-type]
                agent_id=agent_id,
                agent_name=name,
                records=rec_count[(gh_id, kind, agent_id)],
                beds_observed=len(beds),
                beds_scouted=denominator,
                total_severity=total,
                pressure_index=index,
                max_severity=max_sev,
                hotspot_bed=worst_bed if worst_bed != "—" else None,
                pressure_threshold=p_thr,
                over_etl=over,
                hotspot=hot,
                action_required=over or hot,
            )
        )

    out.sort(key=lambda a: (a.greenhouse_id, -a.pressure_index))
    return out


def _headline(agents: list[AgentPressure]) -> str | None:
    """One line naming the worst active issue in a block — hotspots first."""
    actionable = [a for a in agents if a.action_required]
    if not actionable:
        return None
    worst = max(actionable, key=lambda a: (a.hotspot, a.max_severity, a.pressure_index))
    if worst.hotspot:
        where = f" on Bed {worst.hotspot_bed}" if worst.hotspot_bed else ""
        return f"{worst.agent_name} severity {worst.max_severity} detected{where}"
    return (
        f"{worst.agent_name} pressure {worst.pressure_index} ≥ ETL {worst.pressure_threshold}"
    )


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

    # Banding is agent-based (the Interplant model): a block is judged by its
    # worst individual agent, never by a blended cross-agent average.
    agents = await agent_pressure(db, f)
    agents_by_gh: dict[int, list[AgentPressure]] = defaultdict(list)
    for a in agents:
        agents_by_gh[a.greenhouse_id].append(a)

    out: list[GreenhousePressure] = []
    for gh in greenhouses:
        coords = geometry_to_coords(gh.boundary)
        row = by_gh.get(gh.id)
        records = int(row.records) if row else 0
        max_sev = int(row.max_sev) if row else 0
        avg_sev = round(float(row.avg_sev), 2) if row else 0.0

        gh_agents = agents_by_gh.get(gh.id, [])
        action = [a for a in gh_agents if a.action_required]
        if records == 0:
            band = "none"
        elif action:
            band = "high"
        elif any(a.max_severity >= 3 or a.pressure_index >= 0.6 * a.pressure_threshold for a in gh_agents):
            band = "medium"
        else:
            band = "low"

        out.append(
            GreenhousePressure(
                greenhouse_id=gh.id,
                name=gh.name,
                centroid=centroid([(c[0], c[1]) for c in coords]),
                boundary=coords,
                records=records,
                max_severity=max_sev,
                avg_severity=avg_sev,
                over_threshold=len(action),
                pressure=band,  # type: ignore[arg-type]
                headline=_headline(gh_agents),
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
    # Keyword construction — Filters gained fields in the middle, and a
    # positional call here once shifted scouting_for into disease_id.
    gf = Filters(**{**f.__dict__, "greenhouse_id": greenhouse_id})
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
    """Pest **and disease** pressure per greenhouse.

    Both agent types share the grid — a manager scanning a block wants to see
    Powdery Mildew next to Thrips, not on a separate screen.
    """
    out: list[PestMatrixCell] = []

    for kind, model, fk in (
        ("pest", Pest, ScoutingRecord.pest_id),
        ("disease", Disease, ScoutingRecord.disease_id),
    ):
        rows = (
            await db.execute(
                f.apply(
                    select(
                        model.name.label("agent"),
                        Greenhouse.name.label("gh"),
                        func.count().label("records"),
                        func.avg(ScoutingRecord.severity).label("avg_sev"),
                    )
                    .select_from(ScoutingRecord)
                    .join(model, model.id == fk)
                    .join(Greenhouse, Greenhouse.id == ScoutingRecord.greenhouse_id)
                    .group_by(model.name, Greenhouse.name)
                ).order_by(model.name, Greenhouse.name)
            )
        ).all()
        out += [
            PestMatrixCell(
                pest=r.agent,
                kind=kind,  # type: ignore[arg-type]
                greenhouse=r.gh,
                records=int(r.records),
                avg_severity=round(float(r.avg_sev or 0), 2),
            )
            for r in rows
        ]

    return out


async def agent_trend(db: AsyncSession, f: Filters) -> list[AgentTrendPoint]:
    """Daily severity per pest and per disease — one series per agent.

    Lets a manager line an agent's trajectory up against the interventions
    they made, which a single blended trend line can't show.
    """
    out: list[AgentTrendPoint] = []
    day = func.date(ScoutingRecord.recorded_at)

    for kind, model, fk in (
        ("pest", Pest, ScoutingRecord.pest_id),
        ("disease", Disease, ScoutingRecord.disease_id),
    ):
        rows = (
            await db.execute(
                f.apply(
                    select(
                        day.label("d"),
                        model.name.label("agent"),
                        func.count().label("records"),
                        func.coalesce(func.avg(ScoutingRecord.severity), 0).label("avg"),
                        func.coalesce(func.max(ScoutingRecord.severity), 0).label("mx"),
                    )
                    .select_from(ScoutingRecord)
                    .join(model, model.id == fk)
                    .group_by(day, model.name)
                ).order_by(day)
            )
        ).all()
        out += [
            AgentTrendPoint(
                date=r.d,
                agent_kind=kind,  # type: ignore[arg-type]
                agent_name=r.agent,
                records=int(r.records),
                avg_severity=round(float(r.avg), 2),
                max_severity=int(r.mx),
            )
            for r in rows
        ]

    return out


# ───────────────────────────── Scouts ───────────────────────────────────────
async def scout_summary(db: AsyncSession, f: Filters) -> list[ScoutSummary]:
    q = (
        select(
            Employee.id,
            Employee.name,
            func.count(ScoutingRecord.id).label("records"),
            func.count(func.distinct(ScoutingRecord.greenhouse_id)).label("ghs"),
            func.count(func.distinct(ScoutingRecord.bed_code)).label("beds"),
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
                func.count(func.distinct(ScoutingRecord.bed_code)).label("beds"),
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
            beds_visited=int(r.beds or 0),
            last_seen=r.last_seen,
        )
        for r in rows
    ]


# ─────────────────────────── Movement detail ────────────────────────────────
# A scout who lingers is thorough; one who clears a block in four minutes is
# not scouting it. Neither shows up in a record count, so we reconstruct the
# walk from the timestamps.

# Gap beyond which we assume they stopped scouting (lunch, end of shift)
# rather than spending three hours on one bed.
MAX_DWELL_MIN = 45.0


async def scout_movement(db: AsyncSession, f: Filters, scout_id: int) -> ScoutMovement:
    """Reconstruct one scout's walk: which beds, in what order, for how long."""
    emp = (await db.execute(select(Employee).where(Employee.id == scout_id))).scalar_one_or_none()
    if emp is None:
        raise ValueError("Scout not found")

    q = (
        Filters(**{**f.__dict__, "scout_id": scout_id})
        .apply(
            select(
                ScoutingRecord.recorded_at,
                ScoutingRecord.greenhouse_id,
                ScoutingRecord.bed_code,
                ScoutingRecord.severity,
                Greenhouse.name.label("gh"),
                Pest.name.label("pest"),
                Disease.name.label("disease"),
            )
            .select_from(ScoutingRecord)
            .join(Greenhouse, Greenhouse.id == ScoutingRecord.greenhouse_id, isouter=True)
            .join(Pest, Pest.id == ScoutingRecord.pest_id, isouter=True)
            .join(Disease, Disease.id == ScoutingRecord.disease_id, isouter=True)
        )
        .order_by(ScoutingRecord.recorded_at.asc())
    )
    rows = (await db.execute(q)).all()

    by_day: dict[date, list] = defaultdict(list)
    for r in rows:
        by_day[r.recorded_at.date()].append(r)

    days: list[MovementDay] = []
    all_dwells: list[float] = []
    total_beds = 0
    total_minutes = 0.0

    for d in sorted(by_day, reverse=True):
        recs = by_day[d]

        # Collapse consecutive records at the same bed into one stop.
        groups: list[list] = []
        for r in recs:
            key = (r.greenhouse_id, r.bed_code)
            if groups and (groups[-1][0].greenhouse_id, groups[-1][0].bed_code) == key:
                groups[-1].append(r)
            else:
                groups.append([r])

        stops: list[MovementStop] = []
        for i, g in enumerate(groups):
            started = g[0].recorded_at
            # They left when the next stop's first record was logged. The last
            # stop of the day has no such marker, so fall back to its own span
            # (which is 0 for a single record — honestly unknown, not zero).
            if i + 1 < len(groups):
                ended = groups[i + 1][0].recorded_at
            else:
                ended = g[-1].recorded_at
            raw = (ended - started).total_seconds() / 60
            minutes = round(min(raw, MAX_DWELL_MIN), 1) if raw > 0 else None
            if minutes is not None:
                all_dwells.append(minutes)
                total_minutes += minutes
            agents = sorted({a for r in g for a in (r.pest, r.disease) if a})
            stops.append(
                MovementStop(
                    started_at=started,
                    ended_at=ended,
                    minutes=minutes,
                    greenhouse_id=g[0].greenhouse_id,
                    greenhouse=g[0].gh or "—",
                    bed_code=g[0].bed_code,
                    records=len(g),
                    max_severity=max((r.severity or 0) for r in g),
                    agents=agents,
                )
            )

        beds = len({(s.greenhouse_id, s.bed_code) for s in stops if s.bed_code})
        total_beds += beds
        seen_gh: list[str] = []
        for s in stops:
            if not seen_gh or seen_gh[-1] != s.greenhouse:
                seen_gh.append(s.greenhouse)
        days.append(
            MovementDay(
                date=d,
                records=len(recs),
                beds=beds,
                greenhouses=seen_gh,
                first_seen=recs[0].recorded_at,
                last_seen=recs[-1].recorded_at,
                active_minutes=round(sum(s.minutes or 0 for s in stops), 1),
                stops=stops,
            )
        )

    median = None
    if all_dwells:
        srt = sorted(all_dwells)
        mid = len(srt) // 2
        median = srt[mid] if len(srt) % 2 else round((srt[mid - 1] + srt[mid]) / 2, 1)

    return ScoutMovement(
        scout_id=emp.id,
        name=emp.name,
        days=days,
        total_records=len(rows),
        total_beds=total_beds,
        active_minutes=round(total_minutes, 1),
        median_minutes_per_bed=median,
    )


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
