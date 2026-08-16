"""FastAPI application factory & lifespan wiring."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import API_V1_PREFIX
from .config import get_settings
from .database import AsyncSessionLocal, Base, engine
from .routers import (
    analytics,
    approvals,
    auth,
    etl_rules,
    farms,
    integrations,
    media,
    recommendations,
    reference,
    scouting,
    spray,
)
from .seed import seed_if_empty

settings = get_settings()


# Additive column migrations. `create_all` only creates missing *tables* —
# it never alters an existing one, so a column added to a model after the
# first deploy would be missing in production. Each statement is idempotent
# (IF NOT EXISTS), so this is safe to run on every boot.
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
