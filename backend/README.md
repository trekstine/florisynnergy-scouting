# FloriSynergy Scouting — Backend (FastAPI + PostGIS)

A geofenced **scouting, spraying & agronomy** platform for flower farms — a
ground-up rebuild of the existing FloriSynergy scout app, raised to the
standard: precise greenhouse/bed geofencing, rapid
offline field capture, pest/disease pressure mapping, and threshold-driven
intervention recommendations.

> Phase 1 (this repo): **backend + admin portal**. The Flutter scout app comes next.

## Why this exists / what's different

The previous app faked geofencing (hardcoded greenhouse numbers, a stub "GPS out
of range" check) and stored flat records. This rebuild adds:

- **Real geofencing** — farms → greenhouses (PostGIS polygons + QR) → **beds**,
  with offline point-in-polygon (mirrored server-side in Shapely).
- **Offline-first capture** — scouting/spray entries carry a device
  `client_record_id`; batch submit is **idempotent** so zero-signal greenhouses
  never lose or double-post data.
- **Agronomy engine ("Action")** — pest/disease **economic thresholds (ETLs)**
  automatically raise **intervention recommendations**, deduped per
  greenhouse+agent, with baseline/post severity for evaluation.
- **Analytics** — per-greenhouse pressure (heatmap), pest × greenhouse
  matrix, scout accountability, spray cost.

## Stack

FastAPI (async) · SQLAlchemy 2.0 + GeoAlchemy2 · PostgreSQL 16 + **PostGIS** ·
Shapely · JWT (device + PIN) · bcrypt.

## Quick start

```bash
cd backend
docker compose up --build      # API :8000, docs at /docs — seeds a demo farm
```

Seeded demo (a real Naivasha rose farm, 20 OSM greenhouse footprints, beds,
varieties/pests/diseases/chemicals, 4 scouts, ~5 days of scouting):

| Role       | device_identifier  | PIN  |
|------------|--------------------|------|
| Admin      | `web-admin`        | 0000 |
| Supervisor | `sup-device-01`    | 1234 | =
| Scout 1–4  | `scout-device-0N`  | 20N  |

## Key endpoints (`/api/v1`)

- **Auth/Employees:** `POST /auth/login`, `GET /auth/me`, `…/employees`
- **Geofencing:** `…/farms`, `…/greenhouses` (+ `…/greenhouses/{id}/beds`)
- **Reference:** `…/varieties`, `…/pests`, `…/diseases`, `…/chemicals`
- **Capture (offline batch, idempotent):** `POST /scouting/batch`, `POST /spray/batch`, `GET /scouting`, `GET /spray`
- **Analytics:** `/analytics/pressure` (heatmap), `/analytics/pest-matrix`, `/analytics/scouts`, `/analytics/spray-cost`
- **Action:** `GET /recommendations`, `PATCH /recommendations/{id}`

## Scouting capture model

Mirrors the field flow: greenhouse → bed → one of **Disease / Pest / Lure /
Sticky Trap** → variety + severity/counts (FCM, sticky-trap, lure, beneficials)
+ stage + location-on-plant + notes + photo + GPS/QR verification. Many entries
are buffered on-device and submitted as one batch.

## Tests

```bash
pip install -r requirements-dev.txt
pytest                       # no Docker needed
```

The suite runs against a real PostgreSQL every time. If `DATABASE_URL` points
at a live server it uses that; otherwise it starts a throwaway one from the
`pgserver` wheel — no Docker, no root — and installs a stand-in for PostGIS
(`tests/pgshim.py`). To run against genuine PostGIS:

```bash
docker compose up -d db      # DATABASE_URL then points at it
pytest
```

Tests that assert on real spatial arithmetic are marked `needs_postgis` and
skip under the stand-in, whose `ST_Area` returns a fixed figure. Everything
else — constraints, cascades, flush ordering — is the real database.

**Why it is built this way.** The suite used to skip itself wherever PostGIS
was missing, so "51 passed, 7 skipped" meant the edit paths were never
exercised. Three faults reached users through that gap, and every one of them
was database behaviour no unit test could see: `uq_fertigation_block` firing
because SQLAlchemy emits INSERTs before DELETEs, a spray programme failing the
RAC rotation check against its own rows, and a router blanking a column it was
only meant to read. They are now covered by `tests/test_editing.py`, and each
of those tests has been confirmed to fail when its fix is reverted.

Also covers geofencing seed, reference data, **idempotent batch +
recommendation engine**, pressure heatmap, signing, and role guards.

## Layout

```
backend/app/
├── models.py            # farms→greenhouses→beds, employees, varieties/pests/
│                        #   diseases/chemicals, scouting & spray records,
│                        #   recommendations, activity logs
├── routers/             # auth, farms, reference, scouting, spray, analytics,
│                        #   recommendations
├── services/            # analytics.py, recommendations.py (ETL engine)
├── seed.py + seed_greenhouses.py   # real OSM greenhouse footprints + demo data
├── geo.py · security.py · deps.py · config.py · database.py · main.py
```
