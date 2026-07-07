"""Dynamic ETL threshold resolution.

Resolves the effective economic threshold for a pest/disease observation given
optional variety- and greenhouse-scoped override rules. More specific rules win;
on a tie the strictest (lowest) threshold wins — so a market zero-tolerance rule
on a block always bites.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Disease, EtlRule, Pest


@dataclass
class ResolvedThreshold:
    threshold: int
    source: str  # "default" | "variety" | "greenhouse" | "variety+greenhouse"


async def effective_threshold(
    db: AsyncSession,
    *,
    pest_id: int | None = None,
    disease_id: int | None = None,
    variety_id: int | None = None,
    greenhouse_id: int | None = None,
) -> ResolvedThreshold:
    base = 3
    if pest_id is not None:
        pest = await db.get(Pest, pest_id)
        if pest:
            base = pest.threshold
    elif disease_id is not None:
        disease = await db.get(Disease, disease_id)
        if disease:
            base = disease.threshold

    q = select(EtlRule)
    if pest_id is not None:
        q = q.where(EtlRule.pest_id == pest_id)
    elif disease_id is not None:
        q = q.where(EtlRule.disease_id == disease_id)
    else:
        return ResolvedThreshold(base, "default")

    rules = (await db.execute(q)).scalars().all()

    best: tuple[int, int, str] | None = None  # (specificity, -threshold, source)
    for r in rules:
        # Rule applies only if its scope is wildcard or matches the observation.
        if r.variety_id is not None and r.variety_id != variety_id:
            continue
        if r.greenhouse_id is not None and r.greenhouse_id != greenhouse_id:
            continue
        spec = (2 if r.variety_id is not None else 0) + (1 if r.greenhouse_id is not None else 0)
        source = (
            "variety+greenhouse"
            if r.variety_id and r.greenhouse_id
            else "variety"
            if r.variety_id
            else "greenhouse"
            if r.greenhouse_id
            else "default"
        )
        key = (spec, -r.threshold, source)
        if best is None or key > best:
            best = key
            chosen = (r.threshold, source)

    if best is None:
        return ResolvedThreshold(base, "default")
    return ResolvedThreshold(chosen[0], chosen[1])
