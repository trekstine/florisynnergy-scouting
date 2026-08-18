"""Farms, greenhouse geofences, and bed-level geometry."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..geo import coords_to_geometry, geometry_to_coords
from ..models import Bed, Farm, Greenhouse, ScoutingRecord
from ..schemas import (
    BedBulkCreate,
    BedBulkDelete,
    BedCreate,
    BedOut,
    FarmCreate,
    FarmOut,
    GreenhouseCreate,
    GreenhouseOut,
    GreenhouseUpdate,
)

farm_router = APIRouter(prefix="/farms", tags=["farms"])
gh_router = APIRouter(prefix="/greenhouses", tags=["greenhouses"])


# ── Farms ──
@farm_router.get("", response_model=list[FarmOut])
async def list_farms(db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)):
    return (await db.execute(select(Farm).order_by(Farm.id))).scalars().all()


@farm_router.post("", response_model=FarmOut, status_code=status.HTTP_201_CREATED)
async def create_farm(
    payload: FarmCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    farm = Farm(name=payload.name, code=payload.code)
    db.add(farm)
    await db.commit()
    await db.refresh(farm)
    return farm


# ── Greenhouses ──
async def _set_area(db: AsyncSession, gh: Greenhouse) -> None:
    """Compute the block's hectares from its polygon.

    PostGIS does this, not Python: the boundary is lat/lng, and treating those
    as planar coordinates would give an area in square degrees. Casting to
    geography measures on the spheroid.

    Only the seed did this before, so every greenhouse added through the portal
    carried a null area — which silently zeroed the fertigation area sum and
    every m³/ha derived from it.
    """
    await db.execute(
        text(
            "UPDATE greenhouses "
            "SET area_ha = ROUND((ST_Area(boundary::geography) / 10000.0)::numeric, 4) "
            "WHERE id = :id"
        ),
        {"id": gh.id},
    )
    await db.commit()
    await db.refresh(gh)


async def _gh_out(db: AsyncSession, gh: Greenhouse) -> GreenhouseOut:
    bed_count = (
        await db.execute(
            select(func.count()).select_from(Bed).where(Bed.greenhouse_id == gh.id)
        )
    ).scalar_one()
    return GreenhouseOut(
        id=gh.id,
        farm_id=gh.farm_id,
        name=gh.name,
        code=gh.code,
        qr_code_hash=gh.qr_code_hash,
        boundary=geometry_to_coords(gh.boundary),
        bed_count=int(bed_count),
        area_ha=float(gh.area_ha) if gh.area_ha is not None else None,
        phase_id=gh.phase_id,
        created_at=gh.created_at,
    )


@gh_router.get("", response_model=list[GreenhouseOut])
async def list_greenhouses(
    db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)
):
    rows = (await db.execute(select(Greenhouse).order_by(Greenhouse.id))).scalars().all()
    return [await _gh_out(db, g) for g in rows]


@gh_router.post("", response_model=GreenhouseOut, status_code=status.HTTP_201_CREATED)
async def create_greenhouse(
    payload: GreenhouseCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    try:
        geom = coords_to_geometry(payload.boundary)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    gh = Greenhouse(
        name=payload.name,
        code=payload.code,
        qr_code_hash=payload.qr_code_hash,
        boundary=geom,
        farm_id=payload.farm_id,
    )
    db.add(gh)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "qr_code_hash must be unique")
    await db.refresh(gh)
    await _set_area(db, gh)
    return await _gh_out(db, gh)


@gh_router.patch("/{greenhouse_id}", response_model=GreenhouseOut)
async def update_greenhouse(
    greenhouse_id: int,
    payload: GreenhouseUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    gh = await db.get(Greenhouse, greenhouse_id)
    if gh is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Greenhouse not found")
    if payload.name is not None:
        gh.name = payload.name
    if payload.code is not None:
        gh.code = payload.code
    if payload.qr_code_hash is not None:
        gh.qr_code_hash = payload.qr_code_hash
    if payload.boundary is not None:
        try:
            gh.boundary = coords_to_geometry(payload.boundary)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    await db.commit()
    await db.refresh(gh)
    if payload.boundary is not None:
        await _set_area(db, gh)
    return await _gh_out(db, gh)


@gh_router.delete("/{greenhouse_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_greenhouse(
    greenhouse_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin")),
):
    gh = await db.get(Greenhouse, greenhouse_id)
    if gh is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Greenhouse not found")
    await db.delete(gh)
    await db.commit()


# ── Beds ──
def _bed_out(b: Bed, records: int = 0) -> BedOut:
    return BedOut(
        id=b.id,
        greenhouse_id=b.greenhouse_id,
        code=b.code,
        boundary=geometry_to_coords(b.boundary) if b.boundary is not None else None,
        centroid_lat=b.centroid_lat,
        centroid_lng=b.centroid_lng,
        records=records,
    )


async def _record_counts(db: AsyncSession, greenhouse_id: int) -> dict[str, int]:
    """Scouting records per bed code on a block, in one query.

    Records reference a bed by code rather than by id — a scout's phone knows
    "Bed 7", not a primary key — so the count is keyed the same way.
    """
    rows = (
        await db.execute(
            select(ScoutingRecord.bed_code, func.count())
            .where(
                ScoutingRecord.greenhouse_id == greenhouse_id,
                ScoutingRecord.bed_code.isnot(None),
            )
            .group_by(ScoutingRecord.bed_code)
        )
    ).all()
    return {code: int(n) for code, n in rows}


@gh_router.get("/{greenhouse_id}/beds", response_model=list[BedOut])
async def list_beds(
    greenhouse_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(get_current_employee),
):
    rows = (
        await db.execute(
            select(Bed).where(Bed.greenhouse_id == greenhouse_id).order_by(Bed.code)
        )
    ).scalars().all()
    counts = await _record_counts(db, greenhouse_id)
    return [_bed_out(b, counts.get(b.code, 0)) for b in rows]


@gh_router.post(
    "/{greenhouse_id}/beds", response_model=BedOut, status_code=status.HTTP_201_CREATED
)
async def create_bed(
    greenhouse_id: int,
    payload: BedCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    gh = await db.get(Greenhouse, greenhouse_id)
    if gh is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Greenhouse not found")
    geom = None
    clat, clng = payload.centroid_lat, payload.centroid_lng
    if payload.boundary is not None:
        try:
            geom = coords_to_geometry(payload.boundary)
        except ValueError as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
        if clat is None or clng is None:
            from ..geo import centroid

            c = centroid([(x, y) for x, y in payload.boundary])
            clng, clat = c[0], c[1]
    bed = Bed(
        greenhouse_id=greenhouse_id,
        code=payload.code,
        boundary=geom,
        centroid_lat=clat,
        centroid_lng=clng,
    )
    db.add(bed)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bed code must be unique per greenhouse")
    await db.refresh(bed)
    return _bed_out(bed)


@gh_router.post(
    "/{greenhouse_id}/beds/bulk",
    response_model=list[BedOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_beds_bulk(
    greenhouse_id: int,
    payload: BedBulkCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    """Generate a numbered run of beds, e.g. "Bed 1" … "Bed 20".

    Registering every bed matters beyond bookkeeping: the pest pressure index
    divides by the block's bed count, so a partially-registered block skews
    every index computed against it.
    """
    gh = await db.get(Greenhouse, greenhouse_id)
    if gh is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Greenhouse not found")

    existing = set(
        (
            await db.execute(select(Bed.code).where(Bed.greenhouse_id == greenhouse_id))
        ).scalars().all()
    )

    # An explicit list wins: the client showed the user these exact codes, and
    # creating anything else would make the preview a lie.
    if payload.codes:
        wanted = [c.strip() for c in payload.codes if c and c.strip()][:200]
    else:
        wanted = [
            f"{payload.prefix}{n}".strip()
            for n in range(payload.start, payload.start + payload.count)
        ]

    created: list[Bed] = []
    seen: set[str] = set()
    for code in wanted:
        # Idempotent — topping a block up from 12 to 20 is safe.
        if code in existing or code in seen:
            continue
        seen.add(code)
        bed = Bed(greenhouse_id=greenhouse_id, code=code)
        db.add(bed)
        created.append(bed)

    if not created:
        return []
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Could not create those beds")
    for b in created:
        await db.refresh(b)
    return [_bed_out(b) for b in created]


@gh_router.delete("/{greenhouse_id}/beds", status_code=status.HTTP_200_OK)
async def delete_beds_bulk(
    greenhouse_id: int,
    payload: BedBulkDelete,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
) -> dict[str, int]:
    """Remove a selection of beds, or clear the block.

    Generating a run of twenty beds under the wrong naming and then having to
    delete them one at a time is the thing that made this screen painful.
    """
    if await db.get(Greenhouse, greenhouse_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Greenhouse not found")

    q = select(Bed).where(Bed.greenhouse_id == greenhouse_id)
    if payload.bed_ids is not None:
        if not payload.bed_ids:
            return {"deleted": 0}
        q = q.where(Bed.id.in_(payload.bed_ids))

    beds = list((await db.execute(q)).scalars().all())
    for bed in beds:
        await db.delete(bed)
    await db.commit()
    return {"deleted": len(beds)}


@gh_router.delete(
    "/{greenhouse_id}/beds/{bed_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_bed(
    greenhouse_id: int,
    bed_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    bed = await db.get(Bed, bed_id)
    if bed is None or bed.greenhouse_id != greenhouse_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")
    await db.delete(bed)
    await db.commit()
