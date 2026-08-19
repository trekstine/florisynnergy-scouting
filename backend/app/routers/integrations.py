"""Compatibility layer for the Credible Blooms app.

The Blooms app already knows how to capture a scouting walk; what it lacked was
somewhere useful to send it. Rather than rewrite that app around the portal's
schema — ids, batches, foreign keys — the portal speaks the app's dialect here:

* ``POST /session`` takes a submission exactly as the app builds it today and
  turns it into one scouting round, resolving names to references on the way.
* ``GET /records`` hands portal records back in the app's own JSON shape, so
  its existing parser and every screen built on it keep working.

Authentication is a service key rather than a user token, on purpose. A scout
signs into the Blooms app once and must not be asked again; the app proves it
is the app, and names the scout it has already authenticated. Each distinct
scout is provisioned as an employee on first sight so the record is still
attributed to a person, not to "the integration".
"""
from __future__ import annotations

import logging

import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..database import get_db
from ..deps import require_roles
from ..models import (
    Disease,
    Employee,
    Greenhouse,
    IntegrationAlias,
    Pest,
    ScoutingRecord,
    Variety,
)
from ..schemas import (
    AliasIn,
    AliasOut,
    BloomsIngestResult,
    BloomsItem,
    BloomsRecord,
    BloomsSession,
    UnmatchedName,
)
from ..routers.media import ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, MEDIA_DIR
from ..services.matching import ReferenceResolver, Resolution, normalise
from ..services.recommendations import evaluate_entry, evaluate_outcome

router = APIRouter(prefix="/integrations/blooms", tags=["integrations"])

log = logging.getLogger("uvicorn.error")

SOURCE = "blooms"

# The app's labels for what a scout is looking at, mapped onto the portal's.
_SCOUTING_FOR = {
    "disease": "disease",
    "diseases": "disease",
    "pest": "pest",
    "pests": "pest",
    "lure": "lure",
    "lures": "lure",
    "stickytrap": "sticky_trap",
    "stickytraps": "sticky_trap",
    "sticky_trap": "sticky_trap",
    "trap": "sticky_trap",
}


async def require_app_key(
    x_app_key: str | None = Header(default=None, alias="X-App-Key"),
) -> str:
    """Prove the caller is the partner app, not a passer-by.

    Configured out-of-band; if no key is set the integration stays closed
    rather than falling open, which is the only safe default for a write
    endpoint that takes no user token.
    """
    expected = get_settings().integration_api_key
    if not expected:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Integration is not configured on this server.",
        )
    if not x_app_key or x_app_key != expected:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid app key")
    return x_app_key


def _int(value: object) -> int:
    try:
        return int(str(value or "0").strip() or 0)
    except (TypeError, ValueError):
        return 0


def _clean(value: str | None) -> str | None:
    v = (value or "").strip()
    return v or None


async def _scout(db: AsyncSession, name: str | None) -> Employee | None:
    """Find — or create — the employee a submission is attributed to.

    The scout has already authenticated in the Blooms app; this is about giving
    their work a home in the portal, not about authorising it. Provisioned
    inactive-by-default would silently break attribution, so they arrive active
    with the lowest role.
    """
    clean = _clean(name)
    if not clean:
        return None

    target = normalise(clean)
    for emp in (await db.execute(select(Employee))).scalars():
        if normalise(emp.name) == target:
            return emp

    emp = Employee(
        name=clean,
        role="scout",
        device_identifier=f"{SOURCE}:{target}"[:100],
        is_active=True,
    )
    db.add(emp)
    try:
        async with db.begin_nested():
            await db.flush()
    except IntegrityError:
        return None
    return emp


async def _ensure_agents(
    db: AsyncSession, payload: BloomsSession, scouting_for: str
) -> list[str]:
    """Create a pest or disease row for any name the portal does not know.

    Returns the names created, so the caller knows to reload the resolver.

    Marked ``is_provisional``: the row exists, so the observation is filterable,
    chartable and countable from the moment it lands — but it carries no
    agronomist-set threshold, so it does not raise recommendations. That
    division matters. Inventing a threshold would either flood the board with
    false alarms or, worse, sit quietly below a real infestation.

    Trap and lure rounds are excluded. Those record a catch count against a
    monitored flier, and the free-text field on them is often a trap id or a
    note rather than an organism — creating pests from it would fill the
    register with rubbish.
    """
    if scouting_for in ("lure", "sticky_trap"):
        return []

    wanted: list[str] = []
    for item in payload.items:
        name = _clean(item.disease if scouting_for == "disease" else item.pest)
        if not name:
            # A pest round with the name only in the disease field, or the
            # reverse — the app's two fields are not always filled the way the
            # round type implies.
            name = _clean(item.pest if scouting_for == "disease" else item.disease)
        if name and name not in wanted:
            wanted.append(name)
    if not wanted:
        return []

    model = Disease if scouting_for == "disease" else Pest
    kind = "disease" if scouting_for == "disease" else "pest"
    resolver = await ReferenceResolver.load(db)
    lookup = resolver.disease if scouting_for == "disease" else resolver.pest

    created: list[str] = []
    for name in wanted:
        if lookup(name) is not None:
            continue
        row = model(name=name[:150], is_provisional=True)
        if model is Pest:
            row.category = "Unclassified"
        db.add(row)
        try:
            # Nested, so a name that races another request — or collides with a
            # row differing only in case — costs this one name, not the round.
            async with db.begin_nested():
                await db.flush()
        except IntegrityError:
            continue
        created.append(name)
        log.info(
            "Blooms sent an unknown %s %r; created it as provisional (id %s). "
            "It will not raise recommendations until a threshold is set.",
            kind,
            name,
            row.id,
        )
    if created:
        await db.flush()
    return created


async def _note_unmatched(db: AsyncSession, res: Resolution) -> None:
    """Record names that could not be placed, so they can be mapped once.

    Stored with ``target_id = 0`` — a placeholder meaning "seen, undecided".
    The hit counter tells an admin which mismatch is actually costing them
    data and which was a one-off typo.
    """
    for kind, names in res.unmatched.items():
        for name in names:
            row = (
                await db.execute(
                    select(IntegrationAlias).where(
                        IntegrationAlias.kind == kind,
                        IntegrationAlias.alias == name,
                        IntegrationAlias.source == SOURCE,
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                db.add(
                    IntegrationAlias(
                        kind=kind, alias=name, target_id=0, source=SOURCE, hits=1
                    )
                )
            else:
                row.hits += 1


@router.post("/session", response_model=BloomsIngestResult)
async def ingest_session(
    payload: BloomsSession,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_app_key),
):
    """Take one Blooms submission and store it as a scouting round."""
    scouting_for = _SCOUTING_FOR.get(
        normalise(payload.scoutingfor), "pest"
    )
    resolver = await ReferenceResolver.load(db)
    res = Resolution()

    greenhouse_id = resolver.greenhouse(payload.location)
    if greenhouse_id is None:
        res.miss("greenhouse", _clean(payload.location) or "")

    scout = await _scout(db, payload.scout)
    # Any organism the app named that the portal has no row for gets one now,
    # before the items are translated. Storing the record with a null pest was
    # the stopgap, and it cost the manager the observation entirely: no filter,
    # no matrix, no pressure, no recommendation — just a line in a note.
    created_agents = await _ensure_agents(db, payload, scouting_for)
    if created_agents:
        resolver = await ReferenceResolver.load(db)

    batch_id = str(uuid.uuid4())
    recorded_at = payload.recorded_at or datetime.now(timezone.utc)
    comments = _clean(payload.comments)
    recs_created = 0
    accepted = 0

    for item in payload.items:
        record = _to_record(
            item=item,
            scouting_for=scouting_for,
            resolver=resolver,
            res=res,
            batch_id=batch_id,
            greenhouse_id=greenhouse_id,
            scout_id=scout.id if scout else None,
            partition=payload.partition,
            session_variety=payload.variety,
            comments=comments,
            recorded_at=recorded_at,
        )
        db.add(record)
        await db.flush()
        accepted += 1

        # The portal's whole value is the loop: an observation that crosses a
        # threshold raises a recommendation, and a later one closes it. An
        # ingested record has to run the same path as a natively captured one.
        try:
            async with db.begin_nested():
                if await evaluate_entry(db, record):
                    recs_created += 1
        except IntegrityError:
            pass
        try:
            async with db.begin_nested():
                await evaluate_outcome(db, record)
        except IntegrityError:
            pass

    await _note_unmatched(db, res)
    await db.commit()

    return BloomsIngestResult(
        batch_id=batch_id,
        accepted=accepted,
        scout_id=scout.id if scout else None,
        greenhouse_id=greenhouse_id,
        recommendations_created=recs_created,
        unmatched=res.as_dict(),
    )


def _to_record(
    *,
    item: BloomsItem,
    scouting_for: str,
    resolver: ReferenceResolver,
    res: Resolution,
    batch_id: str,
    greenhouse_id: int | None,
    scout_id: int | None,
    partition: str | None,
    session_variety: str | None,
    comments: str | None,
    recorded_at: datetime,
) -> ScoutingRecord:
    """Translate one item. Nothing is dropped for want of a match."""
    pest_name = _clean(item.pest)
    disease_name = _clean(item.disease)

    pest_id = disease_id = None
    if scouting_for == "disease":
        disease_id = resolver.disease(disease_name or pest_name)
        if disease_id is None:
            res.miss("disease", disease_name or pest_name or "")
    else:
        pest_id = resolver.pest(pest_name)
        if pest_id is None and pest_name:
            res.miss("pest", pest_name)

    variety_id, variety_code = resolver.variety(item.variety or session_variety)

    # The app's single `score` field means different things per round type.
    # For a pest or disease it is a 0–5 severity. For a trap or a lure it is a
    # catch count — 40 thrips on a card is not "severity 40", and folding it
    # into severity would let one sticky trap dominate the pressure index for a
    # whole block. Traps carry their number in the count field and a severity
    # of 0, exactly as natively captured trap records do.
    score = _int(item.score)
    severity = 0
    trap_count = 0
    lure_count = 0

    if scouting_for == "disease":
        severity = _int(item.diseaseseverity) or score
    elif scouting_for == "pest":
        severity = _int(item.pestseverity) or score
    elif scouting_for == "sticky_trap":
        trap_count = _int(item.stickytrapbugcount) or score
    else:  # lure
        lure_count = _int(item.luresbugcount) or score

    # Names that could not be resolved are kept in the note rather than lost,
    # so the record still tells a human what was seen.
    note_bits = [b for b in [_clean(item.notes)] if b]
    if pest_id is None and pest_name and scouting_for != "disease":
        note_bits.append(f"Pest as recorded: {pest_name}")
    if disease_id is None and disease_name and scouting_for == "disease":
        note_bits.append(f"Disease as recorded: {disease_name}")

    return ScoutingRecord(
        batch_id=batch_id,
        greenhouse_id=greenhouse_id,
        bed_code=_clean(item.bed) or _clean(partition),
        scout_id=scout_id,
        scouting_for=scouting_for,
        variety_id=variety_id,
        variety_code=variety_code,
        pest_id=pest_id,
        disease_id=disease_id,
        lure_id=_clean(item.lureid),
        sticky_trap_id=_clean(item.stickytrapid),
        stage=_clean(item.stage),
        location_on_plant=_clean(item.locationonplant) or _clean(item.location),
        severity=min(max(severity, 0), 5),
        fcm_count=_int(item.fcmcount),
        sticky_trap_bug_count=trap_count,
        lure_bug_count=lure_count,
        beneficials_count=_int(item.beneficialscount),
        notes=" · ".join(note_bits) or None,
        session_comment=comments,
        image_url=_clean(item.imageurl),
        # Blooms captures no GPS fix or QR scan, and claiming otherwise would
        # corrupt the verification stats the portal reports on.
        verification_method="manual",
        recorded_at=recorded_at,
    )


@router.post("/media", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile,
    _: str = Depends(require_app_key),
) -> dict[str, str]:
    """Take a scouting photo from the partner app into the portal's own store.

    The app previously kept photos in its Firebase bucket and sent the storage
    path as the image url. The portal cannot resolve that — it is not a URL,
    and it belongs to another system's lifecycle. For a record that is meant to
    be evidence, the picture has to live where the record lives.

    Returns the same relative ``/media/...`` url the mobile app gets, so the
    portal and both apps all resolve images the same way.
    """
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Unsupported file type '{suffix}'. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )

    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{suffix}"
    destination = MEDIA_DIR / filename

    size = 0
    with destination.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                out.close()
                destination.unlink(missing_ok=True)
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "Image too large (max 15 MB).",
                )
            out.write(chunk)

    return {"url": f"/media/{filename}"}


@router.get("/records", response_model=list[BloomsRecord])
async def list_records(
    db: AsyncSession = Depends(get_db),
    _: str = Depends(require_app_key),
    days: int = Query(default=120, ge=1, le=730),
    limit: int = Query(default=1000, ge=1, le=5000),
    greenhouse_id: int | None = Query(default=None),
):
    """Portal records, in the shape the Blooms app already parses."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = (
        select(ScoutingRecord)
        .where(ScoutingRecord.recorded_at >= since)
        .order_by(ScoutingRecord.recorded_at.desc())
        .limit(limit)
    )
    if greenhouse_id is not None:
        q = q.where(ScoutingRecord.greenhouse_id == greenhouse_id)
    records = (await db.execute(q)).scalars().all()

    gh = {
        g.id: (g.name or g.code or "")
        for g in (await db.execute(select(Greenhouse))).scalars()
    }
    pests = {p.id: p.name for p in (await db.execute(select(Pest))).scalars()}
    diseases = {d.id: d.name for d in (await db.execute(select(Disease))).scalars()}
    scouts = {e.id: e.name for e in (await db.execute(select(Employee))).scalars()}
    varieties = {
        v.id: v.name for v in (await db.execute(select(Variety))).scalars()
    }

    out: list[BloomsRecord] = []
    for r in records:
        is_disease = r.scouting_for == "disease"
        out.append(
            BloomsRecord(
                recordid=str(r.id),
                variety=(
                    varieties.get(r.variety_id) if r.variety_id else None
                ) or (r.variety_code or ""),
                scout=scouts.get(r.scout_id) or "" if r.scout_id else "",
                location=gh.get(r.greenhouse_id, "") if r.greenhouse_id else "",
                comments=r.session_comment or "",
                bed=r.bed_code or "",
                stickytrapid=r.sticky_trap_id or "",
                lureid=r.lure_id or "",
                scoutingfor=r.scouting_for,
                pestname=pests.get(r.pest_id, "") if r.pest_id else "",
                pestseverity=str(r.severity if not is_disease else 0),
                diseasename=diseases.get(r.disease_id, "") if r.disease_id else "",
                diseaseseverity=str(r.severity if is_disease else 0),
                fcmcount=str(r.fcm_count),
                stickytrapbugcount=str(r.sticky_trap_bug_count),
                luresbugcount=str(r.lure_bug_count),
                beneficialscount=str(r.beneficials_count),
                stage=r.stage or "",
                locationonplant=r.location_on_plant or "",
                notes=r.notes or "",
                imageurl=r.image_url or "",
                createdtime=r.recorded_at.isoformat(),
                batchid=r.batch_id or "",
                greenhouseid=str(r.greenhouse_id or ""),
            )
        )
    return out


# ─────────────────────────── Fixing a mismatch ───────────────────────────────
# Admin-facing, and behind a normal portal token: mapping a name to a reference
# row is an editorial decision, not something the app should be able to do.


@router.get("/unmatched", response_model=list[UnmatchedName])
async def unmatched(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Names seen on the wire that the portal could not place, worst first."""
    rows = (
        await db.execute(
            select(IntegrationAlias)
            .where(IntegrationAlias.target_id == 0)
            .order_by(IntegrationAlias.hits.desc())
        )
    ).scalars().all()
    return [
        UnmatchedName(kind=r.kind, alias=r.alias, hits=r.hits, source=r.source)
        for r in rows
    ]


@router.get("/aliases", response_model=list[AliasOut])
async def list_aliases(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    rows = (
        await db.execute(
            select(IntegrationAlias)
            .where(IntegrationAlias.target_id != 0)
            .order_by(IntegrationAlias.kind, IntegrationAlias.alias)
        )
    ).scalars().all()
    return list(rows)


@router.post("/aliases", response_model=AliasOut, status_code=status.HTTP_201_CREATED)
async def upsert_alias(
    payload: AliasIn,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    """Point a partner-app name at the reference row it means, for good."""
    table = {
        "greenhouse": Greenhouse,
        "pest": Pest,
        "disease": Disease,
        "variety": Variety,
    }[payload.kind]
    if await db.get(table, payload.target_id) is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, f"No {payload.kind} with id {payload.target_id}"
        )

    row = (
        await db.execute(
            select(IntegrationAlias).where(
                IntegrationAlias.kind == payload.kind,
                IntegrationAlias.alias == payload.alias,
                IntegrationAlias.source == payload.source,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = IntegrationAlias(
            kind=payload.kind,
            alias=payload.alias,
            target_id=payload.target_id,
            source=payload.source,
        )
        db.add(row)
    else:
        row.target_id = payload.target_id
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/aliases/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alias(
    alias_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    row = await db.get(IntegrationAlias, alias_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alias not found")
    await db.delete(row)
    await db.commit()


@router.get("/health")
async def health(db: AsyncSession = Depends(get_db), _: str = Depends(require_app_key)):
    """A cheap call the app can make to prove the key and the link both work."""
    count = (
        await db.execute(select(func.count()).select_from(ScoutingRecord))
    ).scalar_one()
    return {"ok": True, "scouting_records": count}
