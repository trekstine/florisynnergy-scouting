"""FastAPI application factory & lifespan wiring."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import API_V1_PREFIX
from .config import get_settings
from .database import AsyncSessionLocal, Base, engine
from .migrate import sync_columns
from .routers import (
    analytics,
    approvals,
    auth,
    etl_rules,
    farms,
    fertigation,
    integrations,
    media,
    recommendations,
    reference,
    scouting,
    spray,
)
from .seed import seed_fertilisers, seed_if_empty

settings = get_settings()


# Additive column migrations kept by hand.
#
# Superseded by `migrate.sync_columns`, which derives the same thing from the
# models — the list is retained because these ran against live databases and
# removing them changes nothing, while a statement here that the derivation
# would phrase differently is worth keeping stable. New columns need no entry.
_COLUMN_MIGRATIONS = (
    "ALTER TABLE scouting_records ADD COLUMN IF NOT EXISTS session_comment TEXT;",
    "ALTER TABLE pests ADD COLUMN IF NOT EXISTS pressure_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.5;",
    "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS pressure_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.5;",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS partition_no VARCHAR(50);",
    # Program lifecycle — planned → applied → reviewed.
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS program_status VARCHAR(20) NOT NULL DEFAULT 'planned';",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS applied_by INTEGER;",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS reviewed_by INTEGER;",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS review_comment TEXT;",
    "ALTER TABLE spray_records ADD COLUMN IF NOT EXISTS effectiveness VARCHAR(20);",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis;")
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _COLUMN_MIGRATIONS:
            await conn.exec_driver_sql(stmt)
        # Then everything the models have gained since. Additive only, and
        # derived rather than remembered — forgetting an entry here is what
        # took the API down with a missing `fertilisers.is_organic`.
        await sync_columns(conn)
    # Say at boot which optional integrations are closed. Without this the
    # first symptom is a scout in a greenhouse getting a 503 on submit, which
    # is the worst possible place to discover a missing environment variable.
    if not settings.integration_api_key:
        logging.getLogger("uvicorn.error").warning(
            "INTEGRATION_API_KEY is not set — the Credible Blooms scouting "
            "integration is closed and will answer 503. Set it in .env and "
            "restart to enable it."
        )

    # The fertiliser register is reference data, not demo data — an existing
    # deployment should gain it on the next boot without a reseed.
    async with AsyncSessionLocal() as db:
        await seed_fertilisers(db)

    if settings.seed_on_startup:
        async with AsyncSessionLocal() as db:
            await seed_if_empty(db)
    yield
    await engine.dispose()


app = FastAPI(
    title="FloriSynergy Scouting — API",
    version="0.1.0",
    description="Geofenced scouting, spraying & agronomy platform.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

media.MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=media.MEDIA_DIR), name="media")


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok"}


app.include_router(auth.router, prefix=API_V1_PREFIX)
app.include_router(auth.emp_router, prefix=API_V1_PREFIX)
app.include_router(farms.farm_router, prefix=API_V1_PREFIX)
app.include_router(farms.gh_router, prefix=API_V1_PREFIX)
app.include_router(reference.router, prefix=API_V1_PREFIX)
app.include_router(scouting.router, prefix=API_V1_PREFIX)
app.include_router(spray.router, prefix=API_V1_PREFIX)
app.include_router(analytics.router, prefix=API_V1_PREFIX)
app.include_router(recommendations.router, prefix=API_V1_PREFIX)
app.include_router(etl_rules.router, prefix=API_V1_PREFIX)
app.include_router(media.router, prefix=API_V1_PREFIX)
app.include_router(integrations.router, prefix=API_V1_PREFIX)
app.include_router(approvals.router, prefix=API_V1_PREFIX)
app.include_router(fertigation.router, prefix=API_V1_PREFIX)
