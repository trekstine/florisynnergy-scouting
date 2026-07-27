"""Spray compliance gate.

Before a recommendation becomes a spray program, screen the chosen chemical
against agronomy and safety rules: resistance rotation (don't re-use the same
RAC mode-of-action on a block), target fit, WHO hazard class, and the
pre-harvest / re-entry intervals. Returns a list of issues; a ``block`` issue
requires an explicit override.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Chemical, Disease, Pest, SprayRecord

# Re-using the same mode of action on a block within this window is a
# resistance-management no-no.
RAC_ROTATION_DAYS = 28
_HAZARD_CLASSES = {"Ia", "Ib", "I", "II"}


@dataclass
class Issue:
    level: str  # "block" | "warn" | "info"
    code: str
    message: str


async def check_spray(
    db: AsyncSession,
    *,
    greenhouse_id: int | None,
    chemical_id: int | None,
    pest_id: int | None = None,
    disease_id: int | None = None,
) -> list[Issue]:
    if chemical_id is None:
        return [Issue("block", "no_chemical", "No chemical selected for this intervention.")]
    chem = await db.get(Chemical, chemical_id)
    if chem is None:
        return [Issue("block", "no_chemical", "Selected chemical no longer exists.")]

    issues: list[Issue] = []

    # Resolve the target agent name for a fit check.
    agent = None
    if pest_id is not None:
        p = await db.get(Pest, pest_id)
        agent = p.name if p else None
    elif disease_id is not None:
        d = await db.get(Disease, disease_id)
        agent = d.name if d else None

    # Target fit — advisory (a farm may lack a perfectly-matched product).
    targets = " ".join(t for t in (chem.target1, chem.target2) if t)
    if agent and targets and agent.lower() not in targets.lower():
        issues.append(
            Issue("warn", "target_mismatch", f"{chem.name} targets {chem.target1 or '—'}, not {agent}.")
        )

    # Resistance rotation — block re-use of the same RAC group on this block.
    if greenhouse_id is not None and chem.rac_code:
        last = (
            await db.execute(
                select(SprayRecord)
                .where(
                    SprayRecord.greenhouse_id == greenhouse_id,
                    SprayRecord.rac_code.isnot(None),
                )
                .order_by(SprayRecord.recorded_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if last is not None and last.rac_code == chem.rac_code:
            days = (datetime.now(timezone.utc) - last.recorded_at).days
            if days <= RAC_ROTATION_DAYS:
                issues.append(
                    Issue(
                        "block",
                        "rac_rotation",
                        f"Same mode of action (RAC {chem.rac_code}) sprayed on this block "
                        f"{days}d ago — rotate the MoA group to manage resistance.",
                    )
                )

    if chem.who_class in _HAZARD_CLASSES:
        issues.append(
            Issue("warn", "who_hazard", f"WHO class {chem.who_class} — highly hazardous; confirm PPE and authorization.")
        )

    if chem.phi_days is not None:
        issues.append(Issue("info", "phi", f"Pre-harvest interval {chem.phi_days} days before this block can be cut."))
    if chem.rei:
        issues.append(Issue("info", "rei", f"Re-entry interval {chem.rei}h after application."))

    return issues


def blocked(issues: list[Issue]) -> bool:
    return any(i.level == "block" for i in issues)
