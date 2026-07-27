"""Append-only governance trail for economic-threshold changes.

Every base-threshold edit and every override-rule create/delete writes one row
here, capturing who, when, old → new, and why. Caller owns the commit.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EtlAudit


async def record(
    db: AsyncSession,
    *,
    employee_id: int | None,
    entity: str,
    action: str,
    entity_id: int | None = None,
    field: str | None = None,
    old: object | None = None,
    new: object | None = None,
    reason: str | None = None,
    summary: str | None = None,
) -> None:
    db.add(
        EtlAudit(
            employee_id=employee_id,
            entity=entity,
            entity_id=entity_id,
            action=action,
            field=field,
            old_value=None if old is None else str(old),
            new_value=None if new is None else str(new),
            reason=reason,
            summary=summary,
        )
    )
