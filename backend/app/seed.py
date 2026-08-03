"""Demo seed — a real Naivasha rose farm with scouts, agronomy reference data,
and a few days of scouting so the dashboards and recommendations have content.

Idempotent: skips if a farm already exists.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from .geo import centroid, coords_to_geometry, point_in_polygon
from .models import (
    Bed,
    Chemical,
    Disease,
    Employee,
    Farm,
    Greenhouse,
    Pest,
    ScoutingRecord,
    SprayRecord,
    Variety,
)
from .seed_greenhouses import GREENHOUSE_BOUNDARIES
from .security import hash_secret
from .services.recommendations import evaluate_entry

# Realistic field notes so the detail table and record cards don't read as
# a wall of identical placeholder text in a demo.
NOTES_BY_KIND = {
    "pest": [
        "Colonies on new growth, worst on the eastern rows.",
        "Light presence, mostly on lower leaves.",
        "Numbers up on last week — monitor closely.",
        "Localised hotspot near the door, rest of bed clean.",
        "Predatory mites present, holding the population down.",
        "Webbing visible on bud tips.",
    ],
    "disease": [
        "Early lesions on lower foliage after the humid spell.",
        "Sporadic spotting, no spread into neighbouring beds yet.",
        "Following last week's rain — watch drainage in this block.",
        "Botrytis pressure rising on open blooms.",
        "Isolated to two plants, removed and bagged.",
    ],
    "lure": [
        "Trap replaced, previous one saturated.",
        "Steady catch, consistent with last check.",
        "Catch down sharply since the last application.",
        "Lure nearing end of life, schedule replacement.",
    ],
    "sticky_trap": [
        "Trap changed, count taken before replacement.",
        "Heavy catch on the windward side.",
        "Low numbers, trap left in place.",
        "Mostly non-target insects on the card.",
    ],
}

# One remark per scouting session, shown against every record in the batch.
SESSION_COMMENTS = [
    "Morning walk, overcast and humid throughout.",
    "Routine weekly round. Irrigation running in two blocks.",
    "Follow-up after Tuesday's application — checking knockdown.",
    "Hot and dry; mite pressure noticeably up across the farm.",
    "Post-rain inspection, focus on drainage-prone beds.",
    None,  # not every session gets a comment
]

VARIETIES = [
    ("RED", "Red Naomi", "#B91C1C"),
    ("WHT", "Avalanche White", "#E5E7EB"),
    ("PNK", "Pink Floyd", "#DB2777"),
    ("YLW", "Gold Strike", "#CA8A04"),
    ("ORG", "Orange Crush", "#EA580C"),
]
PESTS = [
    ("Spider Mites", "Mite", 3),
    ("Thrips", "Insect", 3),
    ("Whitefly", "Insect", 4),
    ("Aphids", "Insect", 3),
    ("False Codling Moth", "Moth", 2),
    ("Caterpillars", "Larvae", 3),
]
DISEASES = [
    ("Downy Mildew", 3),
    ("Powdery Mildew", 3),
    ("Botrytis", 2),
    ("Black Spot", 3),
]
# (name, product, WHO, RAC, active ingredient, target, REI hrs, price/L,
#  rate/ha, water L/ha, PHI days)
CHEMICALS = [
    ("Abamectin 1.8EC", "Acaramik", "II", "6", "Abamectin", "Spider Mites", "12", 1800, 0.5, 1000, 7),
    ("Spinetoram 120SC", "Radiant", "III", "5", "Spinetoram", "Thrips", "6", 3200, 0.4, 1000, 3),
    ("Imidacloprid 200SL", "Confidor", "II", "4A", "Imidacloprid", "Whitefly", "12", 1500, 0.5, 800, 3),
    ("Azoxystrobin 250SC", "Ortiva", "U", "11", "Azoxystrobin", "Downy Mildew", "4", 2600, 0.8, 1000, 7),
    ("Cyprodinil+Fludioxonil", "Switch", "U", "9+12", "Cyprodinil", "Botrytis", "8", 4100, 1.0, 1000, 3),
]
STAGES = ["Egg", "Larva", "Nymph", "Adult"]
PLANT_LOC = ["Top", "Middle", "Bottom", "Bud", "Leaf underside"]


def _rand_point_in(ring: list[list[float]], rng: random.Random) -> tuple[float, float]:
    """Return a random (lng, lat) inside the polygon ring (rejection sampling)."""
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    lo_lng, hi_lng = min(lngs), max(lngs)
    lo_lat, hi_lat = min(lats), max(lats)
    pts = [(p[0], p[1]) for p in ring]
    for _ in range(40):
        lng = rng.uniform(lo_lng, hi_lng)
        lat = rng.uniform(lo_lat, hi_lat)
        if point_in_polygon(lat, lng, pts):
            return lng, lat
    c = centroid(pts)
    return c[0], c[1]


async def seed_if_empty(db: AsyncSession) -> bool:
    if (await db.execute(select(func.count()).select_from(Farm))).scalar_one():
        return False

    farm = Farm(name="Naivasha Rose Estate", code="NRE")
    db.add(farm)
    await db.flush()

    greenhouses: list[Greenhouse] = []
    for n, ring in enumerate(GREENHOUSE_BOUNDARIES, start=1):
        gh = Greenhouse(
            farm_id=farm.id,
            name=f"Greenhouse {n:02d}",
            code=f"GH{n:02d}",
            qr_code_hash=f"GH_{n:02d}_SEC_A_VERIFIED_SECURE",
            boundary=coords_to_geometry(ring),
        )
        greenhouses.append(gh)
    db.add_all(greenhouses)
    await db.flush()

    # Block area (hectares) from the polygon — drives spray dosing later.
    await db.execute(
        text(
            "UPDATE greenhouses "
            "SET area_ha = ROUND((ST_Area(boundary::geography) / 10000.0)::numeric, 4)"
        )
    )

    # A few beds per greenhouse, spread across the footprint.
    rng = random.Random(42)
    for gh, ring in zip(greenhouses, GREENHOUSE_BOUNDARIES):
        for b in range(1, 5):
            blng, blat = _rand_point_in(ring, rng)
            db.add(
                Bed(
                    greenhouse_id=gh.id,
                    code=f"Bed {b}",
                    centroid_lng=blng,
                    centroid_lat=blat,
                )
            )

    varieties = [Variety(code=c, name=n, color=col) for c, n, col in VARIETIES]
    pests = [Pest(name=n, category=cat, threshold=t) for n, cat, t in PESTS]
    diseases = [Disease(name=n, threshold=t) for n, t in DISEASES]
    chemicals = [
        Chemical(
            name=name,
            product=product,
            who_class=who,
            rac_code=rac,
            active_ingredient1=ai,
            target1=target,
            rei=rei,
            buying_price=price,
            type_of_application="Foliar",
            rate=f"{rate_ha}/ha",
            rate_per_ha=rate_ha,
            water_rate_l_per_ha=water_ha,
            phi_days=phi,
        )
        for name, product, who, rac, ai, target, rei, price, rate_ha, water_ha, phi in CHEMICALS
    ]
    db.add_all([*varieties, *pests, *diseases, *chemicals])

    admin = Employee(name="Agronomy Manager", role="admin",
                     device_identifier="web-admin", pin_hash=hash_secret("0000"))
    supervisor = Employee(name="Scouting Supervisor", role="supervisor",
                          device_identifier="sup-device-01", pin_hash=hash_secret("1234"))
    scouts = [
        Employee(name=f"Scout {i}", role="scout",
                 device_identifier=f"scout-device-{i:02d}", pin_hash=hash_secret(f"20{i:02d}"))
        for i in range(1, 5)
    ]
    db.add_all([admin, supervisor, *scouts])
    await db.flush()

    # ── Sample scouting spread across the last 30 days and across each block ──
    now = datetime.now(timezone.utc)
    records: list[ScoutingRecord] = []
    for gh, ring in zip(greenhouses, GREENHOUSE_BOUNDARIES):
        # Records arrive in sessions: one scout, one day, one batch, several
        # entries — the way the mobile app actually submits them.
        for _ in range(rng.randint(3, 5)):
            scout = rng.choice(scouts)
            day = rng.randint(0, 29)
            batch_id = str(uuid.uuid4())
            session_comment = rng.choice(SESSION_COMMENTS)
            session_at = now - timedelta(days=day, hours=rng.randint(0, 8))

            for _ in range(rng.randint(2, 4)):
                plng, plat = _rand_point_in(ring, rng)
                kind = rng.choices(
                    ["pest", "disease", "lure", "sticky_trap"], weights=[5, 3, 1, 1]
                )[0]
                sev = rng.randint(0, 5)
                # A small share of records land unverified or flagged so the
                # data-quality surfaces in the portal have something to show.
                verification = rng.choices(
                    ["gps", "manual", "qr_code"], weights=[8, 1, 1]
                )[0]
                flagged = rng.random() < 0.06
                rec = ScoutingRecord(
                    client_record_id=str(uuid.uuid4()),
                    batch_id=batch_id,
                    greenhouse_id=gh.id,
                    bed_code=f"Bed {rng.randint(1, 4)}",
                    scout_id=scout.id,
                    scouting_for=kind,
                    variety_code=rng.choice(VARIETIES)[0],
                    pest_id=rng.choice(pests).id if kind != "disease" else None,
                    disease_id=rng.choice(diseases).id if kind == "disease" else None,
                    stage=rng.choice(STAGES),
                    location_on_plant=rng.choice(PLANT_LOC),
                    severity=sev,
                    sticky_trap_bug_count=rng.randint(0, 30) if kind == "sticky_trap" else 0,
                    lure_bug_count=rng.randint(0, 20) if kind == "lure" else 0,
                    beneficials_count=rng.randint(0, 8),
                    notes=rng.choice(NOTES_BY_KIND[kind]),
                    session_comment=session_comment,
                    gps_lat=plat,
                    gps_lng=plng,
                    verification_method=verification,
                    flagged=flagged,
                    flag_reason="Severity jumped sharply vs the previous visit."
                    if flagged
                    else None,
                    recorded_at=session_at + timedelta(minutes=rng.randint(0, 90)),
                )
                records.append(rec)
    db.add_all(records)
    await db.flush()

    for rec in records:
        await evaluate_entry(db, rec)

    # ── Spray programs ──────────────────────────────────────────────────────
    # Without these, every spray report (programs, coverage, cost, chemicals,
    # cost-by-greenhouse, cost-by-variety) renders empty and the spray KPIs
    # sit at zero. A program is one application event spanning 1–3 products.
    coverages = ["Full block", "Spot treatment", "Perimeter"]

    # area_ha was written by the raw UPDATE above, which the ORM identity map
    # never saw — read it back so per-block dosing (and therefore cost) varies
    # realistically instead of collapsing to one fallback value.
    area_by_gh = dict(
        (
            await db.execute(select(Greenhouse.id, Greenhouse.area_ha))
        ).all()
    )

    sprays: list[SprayRecord] = []
    for gh in greenhouses:
        for _ in range(rng.randint(2, 4)):
            program_id = str(uuid.uuid4())
            day = rng.randint(0, 29)
            applied_at = now - timedelta(days=day, hours=rng.randint(5, 10))
            coverage = rng.choice(coverages)
            variety_code = rng.choice(VARIETIES)[0]
            area_ha = float(area_by_gh.get(gh.id) or 0.5)

            for chem in rng.sample(chemicals, rng.randint(1, 3)):
                rate_ha = float(chem.rate_per_ha or 0.5)
                qty = round(rate_ha * area_ha, 3)
                price = float(chem.buying_price or 0)
                phi = chem.phi_days or 0
                sprays.append(
                    SprayRecord(
                        client_record_id=str(uuid.uuid4()),
                        program_id=program_id,
                        greenhouse_id=gh.id,
                        bed_code=f"Bed {rng.randint(1, 4)}",
                        variety_code=variety_code,
                        scout_id=supervisor.id,
                        chemical_id=chem.id,
                        product=chem.product,
                        type_of_application=chem.type_of_application,
                        rate=chem.rate,
                        volume_of_water=f"{chem.water_rate_l_per_ha or 1000:.0f} L/ha",
                        coverage=coverage,
                        who_class=chem.who_class,
                        rac_code=chem.rac_code,
                        active_ingredient1=chem.active_ingredient1,
                        target1=chem.target1,
                        rei=chem.rei,
                        qty=qty,
                        buying_price=price,
                        cost_of_chemical=round(qty * price, 2),
                        area_ha=round(area_ha, 4),
                        phi_days=phi,
                        safe_harvest_date=(applied_at + timedelta(days=phi)).date(),
                        comments="Applied per agronomy recommendation.",
                        start_date=applied_at.date(),
                        start_time=applied_at.time().replace(microsecond=0),
                        scout_report_date=(applied_at - timedelta(days=1)).date(),
                        recorded_at=applied_at,
                    )
                )
    db.add_all(sprays)

    await db.commit()
    return True
