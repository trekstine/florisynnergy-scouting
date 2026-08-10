"""Wipe the demo data and lay down a fresh, coherent dataset.

``seed_if_empty`` deliberately skips a populated database, so improvements to
the demo narrative can never reach a deployment that has already booted once.
This is the explicit escape hatch.

    docker compose exec api python -m app.reseed --yes

It is destructive: every domain table is truncated, including employees. That
is the point — a demo environment should be reproducible. It refuses to run
without ``--yes`` so it cannot be triggered by a stray command.
"""
from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import text

from .database import AsyncSessionLocal, Base, engine
from .seed import seed_if_empty


async def reset() -> None:
    # One TRUNCATE across every mapped table: CASCADE settles the foreign
    # keys, RESTART IDENTITY gives the new data ids starting from 1 so demo
    # URLs and screenshots stay stable between runs.
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE"))
    print(f"Truncated {len(Base.metadata.sorted_tables)} tables.")

    async with AsyncSessionLocal() as db:
        seeded = await seed_if_empty(db)
    print("Seeded fresh demo data." if seeded else "Seed skipped — database not empty.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Confirm that every table may be truncated.",
    )
    args = parser.parse_args()
    if not args.yes:
        print(
            "Refusing to run without --yes. This deletes all scouting, spray,\n"
            "recommendation, reference and employee data, then reseeds.",
            file=sys.stderr,
        )
        return 1

    asyncio.run(reset())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
