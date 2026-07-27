"""ETL override rules + governance history.

Base pest/disease thresholds live on the reference records; these rules layer
variety-, greenhouse-, and market-scoped overrides on top, resolved by
specificity in ``services.etl.effective_threshold``. Every create/delete (and
every base-threshold edit, from the reference router) is written to the audit
trail so threshold changes are attributable and reviewable.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_employee, require_roles
from ..models import Disease, EtlAudit, EtlRule, Employee, Pest
from ..schemas import EtlAuditOut, EtlRuleCreate, EtlRuleOut
from ..services.etl_audit import record as audit_record

router = APIRouter(prefix="/etl-rules", tags=["etl-rules"])


async def _rule_summary(db: AsyncSession, rule: EtlRule) -> str:
    if rule.pest_id is not None:
        agent = await db.get(Pest, rule.pest_id)
        name = agent.name if agent else f"Pest #{rule.pest_id}"
    else:
        agent = await db.get(Disease, rule.disease_id) if rule.disease_id else None
        name = agent.name if agent else f"Disease #{rule.disease_id}"
    scope = []
    if rule.variety_id:
        scope.append(f"variety #{rule.variety_id}")
    if rule.greenhouse_id:
        scope.append(f"block #{rule.greenhouse_id}")
    if rule.market:
        scope.append(rule.market)
    where = ", ".join(scope) if scope else "farm-wide"
    return f"{name} ETL {rule.threshold} ({where})"


@router.get("", response_model=list[EtlRuleOut])
async def list_etl_rules(db: AsyncSession = Depends(get_db), _=Depends(get_current_employee)):
    return (
        await db.execute(select(EtlRule).order_by(EtlRule.created_at.desc()))
    ).scalars().all()


@router.get("/audit", response_model=list[EtlAuditOut])
async def list_etl_audit(
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles("admin", "supervisor")),
    limit: int = Query(default=100, le=500),
):
    return (
        await db.execute(select(EtlAudit).order_by(EtlAudit.created_at.desc()).limit(limit))
    ).scalars().all()


@router.post("", response_model=EtlRuleOut, status_code=status.HTTP_201_CREATED)
async def create_etl_rule(
    payload: EtlRuleCreate,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    if (payload.pest_id is None) == (payload.disease_id is None):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Provide exactly one of pest_id or disease_id",
        )
    rule = EtlRule(
        pest_id=payload.pest_id,
        disease_id=payload.disease_id,
        variety_id=payload.variety_id,
        greenhouse_id=payload.greenhouse_id,
        threshold=payload.threshold,
        market=payload.market,
        reason=payload.reason,
        created_by=current.id,
    )
    db.add(rule)
    await db.flush()
    await audit_record(
        db,
        employee_id=current.id,
        entity="rule",
        entity_id=rule.id,
        action="rule_created",
        new=rule.threshold,
        reason=payload.reason,
        summary=await _rule_summary(db, rule),
    )
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_etl_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    current: Employee = Depends(require_roles("admin", "supervisor")),
):
    rule = await db.get(EtlRule, rule_id)
    if rule is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Rule not found")
    summary = await _rule_summary(db, rule)
    await audit_record(
        db,
        employee_id=current.id,
        entity="rule",
        entity_id=rule_id,
        action="rule_deleted",
        old=rule.threshold,
        reason=rule.reason,
        summary=summary,
    )
    await db.delete(rule)
    await db.commit()
