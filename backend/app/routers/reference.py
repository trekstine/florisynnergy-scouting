"""Reference data — varieties, pests, diseases, chemicals."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..models import Chemical, Disease, Employee, Pest, Variety
from ..services.etl_audit import record as audit_record
from ..schemas import (
    ChemicalOut,
    DiseaseCreate,
    DiseaseOut,
    DiseaseUpdate,
    PestCreate,
    PestOut,
    PestUpdate,
    VarietyCreate,
    VarietyOut,
)

router = APIRouter(tags=["reference"])


@router.get("/varieties", response_model=list[VarietyOut])
async def list_varieties(db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)):
    return (await db.execute(select(Variety).order_by(Variety.name))).scalars().all()


@router.post("/varieties", response_model=VarietyOut, status_code=201)
async def create_variety(
    payload: VarietyCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    v = Variety(code=payload.code, name=payload.name, crop=payload.crop, color=payload.color)
    db.add(v)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "variety code must be unique")
    await db.refresh(v)
    return v


@router.get("/pests", response_model=list[PestOut])
async def list_pests(db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)):
    return (await db.execute(select(Pest).order_by(Pest.name))).scalars().all()


@router.post("/pests", response_model=PestOut, status_code=201)
async def create_pest(
    payload: PestCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    p = Pest(name=payload.name, category=payload.category, threshold=payload.threshold)
    db.add(p)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "pest name must be unique")
    await db.refresh(p)
    return p


@router.patch("/pests/{pest_id}", response_model=PestOut)
async def update_pest(
    pest_id: int,
    payload: PestUpdate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    pest = await db.get(Pest, pest_id)
    if pest is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pest not found")
    old_threshold = pest.threshold
    for field in ("name", "category", "threshold", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(pest, field, val)
    if payload.threshold is not None and payload.threshold != old_threshold:
        await audit_record(
            db,
            employee_id=current.id,
            entity="pest",
            entity_id=pest.id,
            action="threshold_change",
            field="threshold",
            old=old_threshold,
            new=payload.threshold,
            reason=payload.reason,
            summary=f"{pest.name} base ETL {old_threshold} → {payload.threshold}",
        )
    await db.commit()
    await db.refresh(pest)
    return pest


@router.get("/diseases", response_model=list[DiseaseOut])
async def list_diseases(db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)):
    return (await db.execute(select(Disease).order_by(Disease.name))).scalars().all()


@router.post("/diseases", response_model=DiseaseOut, status_code=201)
async def create_disease(
    payload: DiseaseCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
):
    d = Disease(name=payload.name, threshold=payload.threshold)
    db.add(d)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "disease name must be unique")
    await db.refresh(d)
    return d


@router.patch("/diseases/{disease_id}", response_model=DiseaseOut)
async def update_disease(
    disease_id: int,
    payload: DiseaseUpdate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    disease = await db.get(Disease, disease_id)
    if disease is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Disease not found")
    old_threshold = disease.threshold
    for field in ("name", "threshold", "is_active"):
        val = getattr(payload, field)
        if val is not None:
            setattr(disease, field, val)
    if payload.threshold is not None and payload.threshold != old_threshold:
        await audit_record(
            db,
            employee_id=current.id,
            entity="disease",
            entity_id=disease.id,
            action="threshold_change",
            field="threshold",
            old=old_threshold,
            new=payload.threshold,
            reason=payload.reason,
            summary=f"{disease.name} base ETL {old_threshold} → {payload.threshold}",
        )
    await db.commit()
    await db.refresh(disease)
    return disease


@router.get("/chemicals", response_model=list[ChemicalOut])
async def list_chemicals(db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)):
    return (await db.execute(select(Chemical).order_by(Chemical.name))).scalars().all()
