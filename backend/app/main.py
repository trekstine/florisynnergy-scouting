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
    auth,
    etl_rules,
    farms,
    media,
    recommendations,
    reference,
    scouting,
    spray,
)
from .seed import seed_if_empty

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS postgis;")
        await conn.run_sync(Base.metadata.create_all)
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
