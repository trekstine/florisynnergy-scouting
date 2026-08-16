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
from collections import defaultdict

from sqlalchemy import func, or_, select
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
    SprayAttachment,
    SprayRecord,
    Variety,
)
from ..schemas import (
    BatchResult,
    ProgramSummary,
    RoundDetail,
    RoundSummary,
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


# ───────────────────────────── Scouting rounds ──────────────────────────────
# A farm says "scouting report" and means a round: one scout, one block, one
# walk, many records. The batch_id already groups them; these endpoints make
# the round a first-class thing you can open — and, crucially, show the spray
# programs that came out of it.


async def _summaries(db: AsyncSession, batch_ids: list[str]) -> dict[str, RoundSummary]:
    """Summarise many rounds in a fixed number of queries.

    The obvious implementation — summarise one round, call it in a loop — costs
    six queries per round, so a manager opening a month of reports fires two
    thousand. These aggregate across every requested batch at once, which keeps
    the page honest whether it is showing five rounds or five hundred.
    """
    if not batch_ids:
        return {}

    scope = ScoutingRecord.batch_id.in_(batch_ids)

    rows = (
        await db.execute(
            select(
                ScoutingRecord.batch_id,
                func.min(ScoutingRecord.recorded_at).label("started"),
                func.max(ScoutingRecord.recorded_at).label("ended"),
                func.count().label("records"),
                func.count(func.distinct(ScoutingRecord.bed_code)).label("beds"),
                func.count().filter(ScoutingRecord.severity > 0).label("findings"),
                func.count().filter(ScoutingRecord.severity >= 4).label("hotspots"),
                func.count()
                .filter(ScoutingRecord.image_url.isnot(None))
                .label("photos"),
                func.count().filter(ScoutingRecord.flagged.is_(True)).label("flagged"),
                func.coalesce(func.max(ScoutingRecord.severity), 0).label("max_sev"),
                func.coalesce(
                    func.sum(ScoutingRecord.beneficials_count), 0
                ).label("beneficials"),
                func.min(ScoutingRecord.greenhouse_id).label("gh"),
                func.min(ScoutingRecord.scout_id).label("scout"),
                func.max(ScoutingRecord.session_comment).label("comment"),
                # Beds that produced no finding at all — walked and clean.
                func.count(func.distinct(ScoutingRecord.bed_code))
                .filter(ScoutingRecord.severity > 0)
                .label("dirty_beds"),
            )
            .where(scope)
            .group_by(ScoutingRecord.batch_id)
        )
    ).all()

    pests: dict[str, set[str]] = defaultdict(set)
    for bid, name in (
        await db.execute(
            select(ScoutingRecord.batch_id, Pest.name)
            .join(Pest, Pest.id == ScoutingRecord.pest_id)
            .where(scope, ScoutingRecord.severity > 0)
            .distinct()
        )
    ).all():
        pests[bid].add(name)

    diseases: dict[str, set[str]] = defaultdict(set)
    for bid, name in (
        await db.execute(
            select(ScoutingRecord.batch_id, Disease.name)
            .join(Disease, Disease.id == ScoutingRecord.disease_id)
            .where(scope, ScoutingRecord.severity > 0)
            .distinct()
        )
    ).all():
        diseases[bid].add(name)

    # Varieties come off the record's own code, so a round on a block that has
    # not been mapped to the variety table still reports what was walked.
    varieties: dict[str, set[str]] = defaultdict(set)
    for bid, code in (
        await db.execute(
            select(ScoutingRecord.batch_id, ScoutingRecord.variety_code)
            .where(scope, ScoutingRecord.variety_code.isnot(None))
            .distinct()
        )
    ).all():
        varieties[bid].add(code)

    gh_ids = {r.gh for r in rows if r.gh}
    houses = {
        g.id: g
        for g in (
            await db.execute(select(Greenhouse).where(Greenhouse.id.in_(gh_ids)))
        ).scalars()
        if gh_ids
    }
    scout_ids = {r.scout for r in rows if r.scout}
    scouts = {
        e.id: e.name
        for e in (
            await db.execute(select(Employee).where(Employee.id.in_(scout_ids)))
        ).scalars()
        if scout_ids
    }

    out: dict[str, RoundSummary] = {}
    for r in rows:
        gh = houses.get(r.gh)
        beds = int(r.beds or 0)
        p = sorted(pests.get(r.batch_id, set()))
        d = sorted(diseases.get(r.batch_id, set()))
        out[r.batch_id] = RoundSummary(
            batch_id=r.batch_id,
            greenhouse_id=r.gh,
            greenhouse=gh.name if gh else None,
            greenhouse_code=gh.code if gh else None,
            scout_id=r.scout,
            scout=scouts.get(r.scout),
            started_at=r.started,
            ended_at=r.ended,
            records=int(r.records),
            beds=beds,
            findings=int(r.findings or 0),
            max_severity=int(r.max_sev or 0),
            session_comment=r.comment,
            agents=sorted(set(p) | set(d)),
            pests=p,
            diseases=d,
            varieties=sorted(varieties.get(r.batch_id, set())),
            clean_beds=max(beds - int(r.dirty_beds or 0), 0),
            hotspots=int(r.hotspots or 0),
            beneficials=int(r.beneficials or 0),
            photos=int(r.photos or 0),
            flagged=int(r.flagged or 0),
            duration_minutes=max(
                int((r.ended - r.started).total_seconds() // 60), 0
            ),
        )
    return out


async def _round_summary(db: AsyncSession, batch_id: str) -> RoundSummary:
    summary = (await _summaries(db, [batch_id])).get(batch_id)
    if summary is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scouting round not found")
    return summary


async def _programs_for(db: AsyncSession, rec_ids: list[int]) -> list[ProgramSummary]:
    """Spray programs raised against any of these recommendations."""
    if not rec_ids:
        return []
    rows = list(
        (
            await db.execute(
                select(SprayRecord)
                .where(SprayRecord.recommendation_id.in_(rec_ids))
                .order_by(SprayRecord.recorded_at.asc())
            )
        ).scalars().all()
    )
    by_program: dict[str, list[SprayRecord]] = defaultdict(list)
    for r in rows:
        by_program[r.program_id or f"#{r.id}"].append(r)

    out: list[ProgramSummary] = []
    for pid, group in by_program.items():
        head = group[0]
        gh = await db.get(Greenhouse, head.greenhouse_id) if head.greenhouse_id else None
        attachments = (
            await db.execute(
                select(func.count())
                .select_from(SprayAttachment)
                .where(SprayAttachment.program_id == pid)
            )
        ).scalar_one()
        harvest = [r.safe_harvest_date for r in group if r.safe_harvest_date]
        out.append(
            ProgramSummary(
                program_id=pid,
                greenhouse_id=head.greenhouse_id,
                greenhouse=gh.name if gh else None,
                bed_code=head.bed_code,
                start_date=head.start_date,
                products=sorted({r.product for r in group if r.product}),
                total_cost=round(sum(float(r.cost_of_chemical or 0) for r in group), 2),
                program_status=head.program_status or "planned",
                safe_harvest_date=max(harvest) if harvest else None,
                recommendation_id=head.recommendation_id,
                attachments=int(attachments or 0),
            )
        )
    return out


@router.get("/rounds", response_model=list[RoundSummary])
async def list_rounds(
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(get_current_employee),
    greenhouse_id: int | None = Query(default=None),
    pest_id: int | None = Query(default=None),
    disease_id: int | None = Query(default=None),
    variety_code: str | None = Query(default=None),
    scout_id: int | None = Query(default=None),
    min_severity: int | None = Query(default=None, ge=0, le=5),
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    limit: int = Query(default=100, le=500),
):
    """Scouting rounds, newest first — the list a manager thinks of as reports.

    The agent filters select *rounds that saw the thing*, not the matching
    records: asking for Thrips returns whole walks in which thrips were found,
    because the round is the unit a manager acts on. The clean beds in those
    rounds still count, which is what keeps the pressure index honest.
    """
    q = select(
        ScoutingRecord.batch_id,
        func.max(ScoutingRecord.recorded_at).label("ended"),
    ).where(ScoutingRecord.batch_id.isnot(None))

    if current.role == "scout":
        q = q.where(ScoutingRecord.scout_id == current.id)
    if greenhouse_id is not None:
        q = q.where(ScoutingRecord.greenhouse_id == greenhouse_id)
    if scout_id is not None:
        q = q.where(ScoutingRecord.scout_id == scout_id)
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

    # Agent and variety filters restrict which *rounds* qualify, so they are
    # applied as a subquery over the records rather than to the outer scope —
    # otherwise the round would come back containing only its matching rows.
    def _rounds_where(*clauses):
        return select(func.distinct(ScoutingRecord.batch_id)).where(*clauses)

    if pest_id is not None:
        q = q.where(
            ScoutingRecord.batch_id.in_(
                _rounds_where(
                    ScoutingRecord.pest_id == pest_id, ScoutingRecord.severity > 0
                )
            )
        )
    if disease_id is not None:
        q = q.where(
            ScoutingRecord.batch_id.in_(
                _rounds_where(
                    ScoutingRecord.disease_id == disease_id,
                    ScoutingRecord.severity > 0,
                )
            )
        )
    if variety_code:
        q = q.where(
            ScoutingRecord.batch_id.in_(
                _rounds_where(ScoutingRecord.variety_code == variety_code)
            )
        )
    if min_severity:
        q = q.where(
            ScoutingRecord.batch_id.in_(
                _rounds_where(ScoutingRecord.severity >= min_severity)
            )
        )

    batches = (
        await db.execute(
            q.group_by(ScoutingRecord.batch_id)
            .order_by(func.max(ScoutingRecord.recorded_at).desc())
            .limit(limit)
        )
    ).all()

    ids = [b.batch_id for b in batches]
    summaries = await _summaries(db, ids)

    # How many spray programs each round led to. One query for the lot: a
    # round's programs are those raised against recommendations for its block
    # and agents, dated at or after the walk.
    await _attach_program_counts(db, list(summaries.values()))

    return [summaries[i] for i in ids if i in summaries]


async def _attach_program_counts(
    db: AsyncSession, summaries: list[RoundSummary]
) -> None:
    """Count the spray programs each round produced, in one pass."""
    if not summaries:
        return

    by_block: dict[int, list[RoundSummary]] = defaultdict(list)
    for s in summaries:
        if s.greenhouse_id is not None:
            by_block[s.greenhouse_id].append(s)
    if not by_block:
        return

    earliest = min(s.started_at for s in summaries)
    rows = (
        await db.execute(
            select(
                SprayRecord.greenhouse_id,
                SprayRecord.program_id,
                func.min(SprayRecord.scout_report_date).label("report_date"),
                func.min(SprayRecord.recorded_at).label("raised_at"),
            )
            .where(
                SprayRecord.greenhouse_id.in_(by_block),
                SprayRecord.program_id.isnot(None),
                SprayRecord.recorded_at >= earliest,
            )
            .group_by(SprayRecord.greenhouse_id, SprayRecord.program_id)
        )
    ).all()

    for row in rows:
        candidates = by_block.get(row.greenhouse_id, [])
        if not candidates:
            continue
        # A program names the scouting report it answers. Failing that, credit
        # the most recent round walked before the program was raised — the one
        # a manager would have been looking at.
        match = None
        if row.report_date:
            match = next(
                (
                    s
                    for s in candidates
                    if s.started_at.date() == row.report_date
                ),
                None,
            )
        if match is None:
            prior = [s for s in candidates if s.started_at <= row.raised_at]
            match = max(prior, key=lambda s: s.started_at) if prior else None
        if match is not None:
            match.programs += 1


@router.get("/rounds/{batch_id}", response_model=RoundDetail)
async def round_detail(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    _: Employee = Depends(get_current_employee),
):
    """One scouting round, with the recommendations and sprays it produced.

    This answers the question the record page could not: a report is a round
    of many records, and the manager wants to know what the *round* led to.
    """
    summary = await _round_summary(db, batch_id)

    entries = list(
        (
            await db.execute(
                select(ScoutingRecord)
                .where(ScoutingRecord.batch_id == batch_id)
                .order_by(
                    ScoutingRecord.severity.desc(), ScoutingRecord.recorded_at.asc()
                )
            )
        ).scalars().all()
    )

    # The recommendations this round's findings raised: same block, same agent,
    # dated within the round's window.
    pest_ids = {e.pest_id for e in entries if e.pest_id and e.severity > 0}
    disease_ids = {e.disease_id for e in entries if e.disease_id and e.severity > 0}
    recs: list[Recommendation] = []
    if summary.greenhouse_id and (pest_ids or disease_ids):
        clauses = []
        if pest_ids:
            clauses.append(Recommendation.pest_id.in_(pest_ids))
        if disease_ids:
            clauses.append(Recommendation.disease_id.in_(disease_ids))
        recs = list(
            (
                await db.execute(
                    select(Recommendation)
                    .where(
                        Recommendation.greenhouse_id == summary.greenhouse_id,
                        or_(*clauses),
                        Recommendation.created_at >= summary.started_at,
                    )
                    .order_by(Recommendation.created_at.asc())
                )
            ).scalars().all()
        )

    programs = await _programs_for(db, [r.id for r in recs])
    summary.programs = len(programs)

    return RoundDetail(
        round=summary,
        entries=[ScoutingOut.model_validate(e) for e in entries],
        recommendations=[
            {
                "id": r.id,
                "status": r.status,
                "note": r.note,
                "outcome_note": r.outcome_note,
                "trigger_severity": r.trigger_severity,
                "bed_code": r.bed_code,
                "created_at": r.created_at.isoformat(),
            }
            for r in recs
        ],
        programs=programs,
    )


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
