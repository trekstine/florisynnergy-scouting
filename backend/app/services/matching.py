"""Resolve free-text names from partner apps onto portal reference rows.

The Credible Blooms app records a greenhouse as "Greenhouse 01", a pest as
"Thrips" and a variety as a code typed by the scout. The portal stores foreign
keys. Something has to sit between the two, and it should be forgiving: a
scouting round must never be lost because somebody typed "Green house 1".

The rules, in order:

1. An explicit alias, if an admin has mapped this exact text before.
2. An exact match on the normalised name (or code, for greenhouses).
3. A prefix/containment match, but only when it is unambiguous.

Anything still unresolved is reported back rather than silently dropped — the
record is stored with the original text preserved so nothing is lost, and the
name surfaces in the unmatched list so it can be aliased once and for all.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Disease, Greenhouse, IntegrationAlias, Pest, Variety

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalise(text: str | None) -> str:
    """Casefold and strip everything that is not a letter or digit.

    "Green House 01 " and "greenhouse-1" both become "greenhouse01" and
    "greenhouse1" respectively — still different, which is why the leading-zero
    case is handled separately below.
    """
    if not text:
        return ""
    return _NON_ALNUM.sub("", text.strip().lower())


def _variants(text: str) -> set[str]:
    """Forms of a name that should be treated as the same thing.

    Farms write GH01, GH1 and "Greenhouse 1" interchangeably, so the zero-padded
    and unpadded numeric tails both count.
    """
    base = normalise(text)
    out = {base}
    # Strip leading zeros from any trailing number: greenhouse01 → greenhouse1
    m = re.match(r"^(.*?)(0*)(\d+)$", base)
    if m and m.group(2):
        out.add(f"{m.group(1)}{m.group(3)}")
    return {v for v in out if v}


@dataclass
class Resolution:
    """The outcome of resolving one payload's worth of names."""

    unmatched: dict[str, set[str]] = field(default_factory=dict)

    def miss(self, kind: str, value: str) -> None:
        if value:
            self.unmatched.setdefault(kind, set()).add(value)

    def as_dict(self) -> dict[str, list[str]]:
        return {k: sorted(v) for k, v in self.unmatched.items() if v}


class ReferenceResolver:
    """Name → id lookups for one request, loaded once and reused per item.

    A scouting session carries dozens of items that name the same handful of
    greenhouses and pests. Loading the reference tables once per request keeps
    that to four queries instead of four per row.
    """

    def __init__(self) -> None:
        self._greenhouses: dict[str, int] = {}
        self._pests: dict[str, int] = {}
        self._diseases: dict[str, int] = {}
        self._varieties: dict[str, tuple[int, str]] = {}
        self._aliases: dict[tuple[str, str], int] = {}

    @classmethod
    async def load(cls, db: AsyncSession) -> ReferenceResolver:
        self = cls()

        for gh in (await db.execute(select(Greenhouse))).scalars():
            for text in (gh.name, gh.code):
                for v in _variants(text or ""):
                    self._greenhouses.setdefault(v, gh.id)

        for pest in (await db.execute(select(Pest))).scalars():
            for v in _variants(pest.name):
                self._pests.setdefault(v, pest.id)

        for dis in (await db.execute(select(Disease))).scalars():
            for v in _variants(dis.name):
                self._diseases.setdefault(v, dis.id)

        for var in (await db.execute(select(Variety))).scalars():
            for text in (var.code, var.name):
                for v in _variants(text or ""):
                    self._varieties.setdefault(v, (var.id, var.code))

        for alias in (await db.execute(select(IntegrationAlias))).scalars():
            self._aliases[(alias.kind, normalise(alias.alias))] = alias.target_id

        return self

    # ── lookups ─────────────────────────────────────────────────────────────
    def _lookup(self, table: dict[str, int], kind: str, text: str | None) -> int | None:
        if not text:
            return None
        for v in _variants(text):
            hit = self._aliases.get((kind, v))
            if hit is not None:
                return hit
            hit = table.get(v)
            if hit is not None:
                return hit
        # Unambiguous containment, e.g. "Thrips (western flower)" → "Thrips".
        base = normalise(text)
        if len(base) >= 4:
            near = {v for v in table if base in v or v in base}
            ids = {table[v] for v in near}
            if len(ids) == 1:
                return ids.pop()
        return None

    def greenhouse(self, text: str | None) -> int | None:
        return self._lookup(self._greenhouses, "greenhouse", text)

    def pest(self, text: str | None) -> int | None:
        return self._lookup(self._pests, "pest", text)

    def disease(self, text: str | None) -> int | None:
        return self._lookup(self._diseases, "disease", text)

    def variety(self, text: str | None) -> tuple[int | None, str | None]:
        """Varieties keep their code on the record even when the id is unknown."""
        if not text:
            return None, None
        for v in _variants(text):
            alias = self._aliases.get(("variety", v))
            if alias is not None:
                return alias, text.strip()
            hit = self._varieties.get(v)
            if hit is not None:
                return hit[0], hit[1]
        return None, text.strip()
