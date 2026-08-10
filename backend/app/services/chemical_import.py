"""Import the master chemical list from the legacy FloriSynergy API.

The legacy list carries real buying prices, active ingredients and targets,
which makes cost reporting meaningful. It does *not* carry the agronomy
fields this platform needs for dosing and compliance — rate per hectare,
water rate, PHI, WHO class, RAC group — so those are left blank and flagged
back to the caller for a human to fill in on the Reference page.

Idempotent: matching is by chemical name, so re-running updates in place
rather than duplicating, and never clobbers locally-entered agronomy data
with nulls.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..models import Chemical


@dataclass
class ImportResult:
    fetched: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    # Names imported without dosing data — the spray builder can't price
    # these until someone sets rate/ha and PHI.
    needs_agronomy: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _s(row: dict, *keys: str) -> str | None:
    """First non-empty value among `keys` — the legacy API renames fields."""
    for k in keys:
        v = row.get(k)
        if v is not None and str(v).strip() not in ("", "null", "None"):
            return str(v).strip()
    return None


def _num(row: dict, *keys: str) -> float | None:
    raw = _s(row, *keys)
    if raw is None:
        return None
    # Prices arrive as "1,800.00", "KES 1800" etc.
    cleaned = re.sub(r"[^0-9.\-]", "", raw.replace(",", ""))
    try:
        return float(cleaned) if cleaned not in ("", "-", ".") else None
    except ValueError:
        return None


def _int(row: dict, *keys: str) -> int | None:
    v = _num(row, *keys)
    return int(v) if v is not None else None


async def fetch_rows() -> list[dict]:
    """POST to the legacy endpoint and return its rows."""
    settings = get_settings()
    if not settings.flori_api_key:
        raise RuntimeError(
            "FLORI_API_KEY is not set — add it to the API service's .env."
        )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            settings.flori_api_url,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"api_key": settings.flori_api_key, "type": "Chemical"},
        )
    resp.raise_for_status()

    # The legacy API occasionally emits raw control characters inside JSON
    # strings, which strict parsers reject — the mobile app strips them too.
    sanitized = re.sub(r"[\x00-\x1F\x7F]", " ", resp.text)
    data = json.loads(sanitized)

    # Payload may be a bare list or wrapped ({"data": [...]} / {"chemicals": …}).
    if isinstance(data, dict):
        for key in ("data", "chemicals", "result", "rows", "records"):
            if isinstance(data.get(key), list):
                data = data[key]
                break
    if not isinstance(data, list):
        raise RuntimeError("Unexpected payload shape from the chemical endpoint.")
    return [r for r in data if isinstance(r, dict)]


async def import_chemicals(db: AsyncSession) -> ImportResult:
    result = ImportResult()
    rows = await fetch_rows()
    result.fetched = len(rows)

    existing = {
        c.name.strip().lower(): c
        for c in (await db.execute(select(Chemical))).scalars().all()
    }

    for row in rows:
        name = _s(row, "chemical", "product", "name", "productname")
        if not name:
            result.skipped += 1
            continue

        price = _num(row, "buyingprice", "buying_price", "price", "costofchemical")
        fields = {
            "product": _s(row, "product", "productname", "tradename") or name,
            "active_ingredient1": _s(row, "activeingredient1", "active_ingredient1"),
            "active_ingredient1_conc": _s(
                row, "activeingredient1conc", "active_ingredient1_conc"
            ),
            "active_ingredient2": _s(row, "activeingredient2", "active_ingredient2"),
            "active_ingredient2_conc": _s(
                row, "activeingredient2conc", "active_ingredient2_conc"
            ),
            "target1": _s(row, "target1", "target"),
            "target2": _s(row, "target2"),
            "who_class": _s(row, "whoclass", "who_class", "who"),
            "rac_code": _s(row, "raccode", "rac_code", "rac"),
            "rei": _s(row, "rei", "reentryinterval"),
            "type_of_application": _s(
                row, "typeofapplication", "type_of_application", "applicationtype"
            ),
            "rate": _s(row, "rate", "doserate"),
            "buying_price": price,
            "rate_per_ha": _num(row, "rateperha", "rate_per_ha"),
            "water_rate_l_per_ha": _num(row, "waterrate", "water_rate_l_per_ha"),
            "phi_days": _int(row, "phi", "phidays", "phi_days"),
        }

        chem = existing.get(name.strip().lower())
        if chem is None:
            chem = Chemical(name=name, **{k: v for k, v in fields.items() if v is not None})
            db.add(chem)
            existing[name.strip().lower()] = chem
            result.created += 1
        else:
            # Only overwrite with values the source actually has, so agronomy
            # data entered here isn't wiped by a re-import.
            for k, v in fields.items():
                if v is not None:
                    setattr(chem, k, v)
            result.updated += 1

        if chem.rate_per_ha is None or chem.phi_days is None:
            result.needs_agronomy.append(name)

    await db.commit()
    return result
