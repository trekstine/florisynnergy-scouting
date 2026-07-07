"""Farms, greenhouse geofences, and bed-level geometry."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..geo import coords_to_geometry, geometry_to_coords
from ..models import Bed, Farm, Greenhouse
from ..schemas import (
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
def _bed_out(b: Bed) -> BedOut:
    return BedOut(
        id=b.id,
        greenhouse_id=b.greenhouse_id,
        code=b.code,
        boundary=geometry_to_coords(b.boundary) if b.boundary is not None else None,
        centroid_lat=b.centroid_lat,
        centroid_lng=b.centroid_lng,
    )


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
    return [_bed_out(b) for b in rows]


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
