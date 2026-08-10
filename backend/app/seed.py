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
    Recommendation,
    ScoutingRecord,
    SprayRecord,
    Variety,
)
from .seed_greenhouses import GREENHOUSE_BOUNDARIES
from .security import hash_secret
from .services.recommendations import evaluate_entry, evaluate_outcome
from .services.spray import compose_spray

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
# (name, category, base ETL, pressure ETL)
# Pressure ETL is the block-wide index — Σ per-bed severity ÷ beds scouted.
# Values sit low by nature: one severity-3 bed in a 20-bed block is 0.15.
# Aggressive spreaders (mites, FCM) get tighter indices than slower ones.
PESTS = [
    ("Spider Mites", "Mite", 3, 0.15),
    ("Thrips", "Insect", 3, 0.20),
    ("Whitefly", "Insect", 4, 0.25),
    ("Aphids", "Insect", 3, 0.25),
    ("False Codling Moth", "Moth", 2, 0.10),
    ("Caterpillars", "Larvae", 3, 0.20),
]
# (name, base ETL, pressure ETL)
DISEASES = [
    ("Downy Mildew", 3, 0.15),
    ("Powdery Mildew", 3, 0.20),
    ("Botrytis", 2, 0.10),
    ("Black Spot", 3, 0.25),
]
# (name, product, WHO, RAC, active ingredient, target, REI hrs, price/L,
#  rate/ha, water L/ha, PHI days, rate per 100 L)
#
# Two modes of action per major target, deliberately: the compliance gate
# blocks re-using the same RAC group on a block inside 28 days, so a farm with
# only one product per pest could never spray twice without an override.
CHEMICALS = [
    ("Abamectin 1.8EC", "Acaramik", "II", "6", "Abamectin", "Spider Mites", "12", 1800, 0.5, 1000, 7, 50),
    ("Spiromesifen 240SC", "Oberon", "U", "23", "Spiromesifen", "Spider Mites", "12", 4200, 0.4, 1000, 3, 40),
    ("Spinetoram 120SC", "Radiant", "III", "5", "Spinetoram", "Thrips", "6", 3200, 0.4, 1000, 3, 35),
    ("Cyantraniliprole 100SE", "Benevia", "U", "28", "Cyantraniliprole", "Thrips", "12", 5200, 0.6, 1000, 3, 60),
    ("Imidacloprid 200SL", "Confidor", "II", "4A", "Imidacloprid", "Whitefly", "12", 1500, 0.5, 800, 3, 50),
    ("Azoxystrobin 250SC", "Ortiva", "U", "11", "Azoxystrobin", "Downy Mildew", "4", 2600, 0.8, 1000, 7, 80),
    ("Myclobutanil 125EC", "Systhane", "III", "3", "Myclobutanil", "Powdery Mildew", "12", 2900, 0.5, 1000, 7, 45),
    ("Cyprodinil+Fludioxonil", "Switch", "U", "9+12", "Cyprodinil", "Botrytis", "8", 4100, 1.0, 1000, 3, 100),
    ("Bacillus subtilis QST713", "Serenade", "U", "BM02", "Bacillus subtilis", "Botrytis", "4", 2200, 2.0, 1000, 0, 200),
]

# How many beds a rose block runs to. The pressure index divides by beds
# scouted, so this is not cosmetic: with four beds a single severity-4 reading
# yields an index of 1.0 against an ETL of 0.15 and *every* block screams.
BEDS_PER_GREENHOUSE = 20
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
        for b in range(1, BEDS_PER_GREENHOUSE + 1):
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
    pests = [
        Pest(name=n, category=cat, threshold=t, pressure_threshold=pt)
        for n, cat, t, pt in PESTS
    ]
    diseases = [
        Disease(name=n, threshold=t, pressure_threshold=pt) for n, t, pt in DISEASES
    ]
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
            rate=f"{rate_100l:g}/100L",
            rate_per_ha=rate_ha,
            water_rate_l_per_ha=water_ha,
            phi_days=phi,
        )
        for name, product, who, rac, ai, target, rei, price, rate_ha, water_ha, phi, rate_100l in CHEMICALS
    ]
    # Label rate per 100 L, keyed by product name — the spray sheet's unit.
    RATE_100L = {c[0]: c[11] for c in CHEMICALS}
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

    # ── Scouting: a narrative, not noise ────────────────────────────────────
    #
    # Random severities make every block look equally alarming and leave the
    # observation → recommendation → spray → outcome loop with nothing to
    # show. Here most blocks stay quiet and five carry a deliberate arc a demo
    # can be walked through.
    #
    # Crucially, a round covers *every* bed. The pressure index divides by
    # beds scouted and counts a clean bed as 0 — walk five beds out of twenty
    # and a single moderate finding reads as farm-wide pressure.
    now = datetime.now(timezone.utc)

    # Weekly rounds over the last month, oldest first.
    WEEK_OFFSETS = [28, 22, 16, 10, 4]

    pest_by_name = {p.name: p for p in pests}
    disease_by_name = {d.name: d for d in diseases}

    # block index → (kind, agent, severity per week, treated?)
    # The last field is the week the farm reacted; None means nobody has
    # acted yet. The spray itself lands two days after the recommendation
    # that triggered it, wherever in the arc that falls.
    ARCS: dict[int, tuple[str, str, list[int], int | None]] = {
        # Caught and climbing — still open, the headline case.
        2: ("pest", "Spider Mites", [1, 2, 3, 4, 4], None),
        # Sprayed and coming down — the loop closing cleanly.
        5: ("pest", "Thrips", [2, 4, 3, 2, 1], 1),
        # Sprayed and stubborn — the case that needs escalating.
        8: ("disease", "Powdery Mildew", [2, 4, 4, 4, 4], 1),
        # Sprayed, resolved, quiet since.
        11: ("disease", "Botrytis", [1, 3, 4, 2, 0], 2),
        # A slow build that only just crossed the line.
        14: ("pest", "Whitefly", [0, 1, 1, 2, 4], None),
    }

    # Background rounds mostly find nothing. Weighted so a typical block sits
    # under its ETL and only occasionally throws up something incidental.
    HOT_BED_COUNT = [0] * 9 + [1] * 7 + [2] * 3 + [3]
    HOT_SEVERITY = [1, 1, 1, 2, 2, 3]

    # Sticky cards and pheromone lures monitor flying adults — assigning
    # them a random pest would credit a trap catch to spider mites, and
    # would quietly breach the tight quarantine ETLs in every block.
    TRAP_TARGETS = ("Thrips", "Whitefly")

    records: list[ScoutingRecord] = []
    # Blocks that get treated — resolved once the recommendations exist.
    treatment_plan: list[tuple[Greenhouse, str, str]] = []

    def walk_block(
        gh: Greenhouse,
        ring: list[list[float]],
        scout: Employee,
        session_at: datetime,
        kind: str,
        agent,
        severity_by_bed: dict[int, int],
        variety_code: str,
    ) -> None:
        """One round: every bed, in order, one record each."""
        batch_id = str(uuid.uuid4())
        session_comment = rng.choice(SESSION_COMMENTS)
        is_disease = kind == "disease"
        clock = 0
        for bed_no in range(1, BEDS_PER_GREENHOUSE + 1):
            clock += rng.randint(2, 6)
            sev = severity_by_bed.get(bed_no, 0)
            plng, plat = _rand_point_in(ring, rng)
            flagged = sev >= 3 and rng.random() < 0.15
            records.append(
                ScoutingRecord(
                    client_record_id=str(uuid.uuid4()),
                    batch_id=batch_id,
                    greenhouse_id=gh.id,
                    bed_code=f"Bed {bed_no}",
                    scout_id=scout.id,
                    scouting_for=kind,
                    variety_code=variety_code,
                    pest_id=None if is_disease else agent.id,
                    disease_id=agent.id if is_disease else None,
                    stage=rng.choice(STAGES) if sev else None,
                    location_on_plant=rng.choice(PLANT_LOC) if sev else None,
                    severity=sev,
                    beneficials_count=rng.randint(0, 8) if sev == 0 else rng.randint(0, 3),
                    notes=rng.choice(NOTES_BY_KIND[kind]) if sev else None,
                    session_comment=session_comment,
                    gps_lat=plat,
                    gps_lng=plng,
                    verification_method=rng.choices(
                        ["gps", "manual", "qr_code"], weights=[8, 1, 1]
                    )[0],
                    flagged=flagged,
                    flag_reason=(
                        "Severity jumped sharply vs the previous visit."
                        if flagged
                        else None
                    ),
                    recorded_at=session_at + timedelta(minutes=clock),
                )
            )

    for idx, (gh, ring) in enumerate(zip(greenhouses, GREENHOUSE_BOUNDARIES)):
        arc = ARCS.get(idx)
        # A block has a regular scout — that's what makes the movement report
        # meaningful rather than a lottery of names.
        scout = scouts[idx % len(scouts)]
        variety_code = VARIETIES[idx % len(VARIETIES)][0]

        for week, days_ago in enumerate(WEEK_OFFSETS):
            day_start = now - timedelta(days=days_ago)
            day_start = day_start.replace(hour=7, minute=rng.randint(0, 40))

            # The routine round: one focus agent, whole block, mostly clean.
            focus_kind = "disease" if rng.random() < 0.4 else "pest"
            focus = rng.choice(diseases if focus_kind == "disease" else pests)
            hot = rng.sample(
                range(1, BEDS_PER_GREENHOUSE + 1), rng.choice(HOT_BED_COUNT)
            )
            walk_block(
                gh,
                ring,
                scout,
                day_start,
                focus_kind,
                focus,
                {b: rng.choice(HOT_SEVERITY) for b in hot},
                variety_code,
            )

            # The arc agent gets its own round, later the same morning.
            if arc is not None:
                arc_kind, agent_name, weekly, _ = arc
                arc_agent = (
                    pest_by_name[agent_name]
                    if arc_kind == "pest"
                    else disease_by_name[agent_name]
                )
                peak = weekly[week]
                centre = 6 + (idx % 5)
                walk_block(
                    gh,
                    ring,
                    scout,
                    day_start + timedelta(hours=2),
                    arc_kind,
                    arc_agent,
                    {
                        centre: peak,
                        centre + 1: max(peak - 1, 0),
                        centre + 2: max(peak - 2, 0),
                    },
                    variety_code,
                )

            # Traps are checked on the same visit — a couple of stations only,
            # so the scouting-type breakdown isn't a two-slice pie.
            trap_kind = rng.choice(["lure", "sticky_trap"])
            trap_batch = str(uuid.uuid4())
            for station in rng.sample(range(1, BEDS_PER_GREENHOUSE + 1), 2):
                plng, plat = _rand_point_in(ring, rng)
                records.append(
                    ScoutingRecord(
                        client_record_id=str(uuid.uuid4()),
                        batch_id=trap_batch,
                        greenhouse_id=gh.id,
                        bed_code=f"Bed {station}",
                        scout_id=scout.id,
                        scouting_for=trap_kind,
                        variety_code=variety_code,
                        pest_id=pest_by_name[rng.choice(TRAP_TARGETS)].id,
                        severity=rng.choice([0, 0, 0, 1, 1]),
                        sticky_trap_bug_count=(
                            rng.randint(2, 30) if trap_kind == "sticky_trap" else 0
                        ),
                        lure_bug_count=rng.randint(1, 20) if trap_kind == "lure" else 0,
                        beneficials_count=rng.randint(0, 4),
                        notes=rng.choice(NOTES_BY_KIND[trap_kind]),
                        gps_lat=plat,
                        gps_lng=plng,
                        verification_method="gps",
                        recorded_at=day_start + timedelta(hours=4, minutes=station),
                    )
                )

        if arc is not None:
            arc_kind, agent_name, _, treat_week = arc
            if treat_week is not None:
                treatment_plan.append((gh, agent_name, arc_kind))

    db.add_all(records)
    await db.flush()

    # ── Drive the loop in chronological order ───────────────────────────────
    # Recommendations are dated to the observation that raised them, so the
    # order records are evaluated in decides which follow-up counts as a
    # re-scout. Out of order, every recommendation reads "No follow-up".
    records.sort(key=lambda r: r.recorded_at)
    for entry in records:
        await evaluate_entry(db, entry)
    await db.flush()

    # ── Spray programs ──────────────────────────────────────────────────────
    # Composed through the same service the portal uses, so seeded programs
    # carry identical dosing, costing and PHI arithmetic to anything created
    # in the app — the demo cannot drift from the product.
    chem_by_target: dict[str, list[Chemical]] = {}
    for c in chemicals:
        chem_by_target.setdefault(c.target1 or "", []).append(c)

    gh_index = {gh.id: i for i, gh in enumerate(greenhouses)}
    sprays: list[SprayRecord] = []

    async def add_program(
        gh: Greenhouse,
        products: list[Chemical],
        applied_at: datetime,
        *,
        bed_code: str | None,
        recommendation_id: int | None,
        note: str,
    ) -> None:
        program_id = str(uuid.uuid4())
        volume = float(rng.choice([800, 1000, 1200, 1500]))
        variety_code = VARIETIES[gh_index[gh.id] % len(VARIETIES)][0]
        for chem in products:
            sprays.append(
                await compose_spray(
                    db,
                    greenhouse_id=gh.id,
                    chemical_id=chem.id,
                    recorded_at=applied_at,
                    bed_code=bed_code,
                    partition_no=rng.choice(["A", "B", None]),
                    variety_code=variety_code,
                    coverage=rng.choice(["Full Cover", "Top Cover"]),
                    comments=note,
                    start_date=applied_at.date(),
                    start_time=applied_at.time().replace(microsecond=0),
                    scout_report_date=(applied_at - timedelta(days=2)).date(),
                    type_of_application="Foliar",
                    rei=chem.rei,
                    volume_of_water_l=volume,
                    rate=float(RATE_100L[chem.name]),
                    recommendation_id=recommendation_id,
                    client_record_id=str(uuid.uuid4()),
                    program_id=program_id,
                    scout_id=supervisor.id,
                )
            )

    # 1. Treatments that answer a recommendation — the loop the product sells.
    for gh, agent_name, arc_kind in treatment_plan:
        agent = (
            pest_by_name[agent_name]
            if arc_kind == "pest"
            else disease_by_name[agent_name]
        )
        q = select(Recommendation).where(Recommendation.greenhouse_id == gh.id)
        q = (
            q.where(Recommendation.pest_id == agent.id)
            if arc_kind == "pest"
            else q.where(Recommendation.disease_id == agent.id)
        )
        rec = (
            await db.execute(q.order_by(Recommendation.created_at.asc()).limit(1))
        ).scalar_one_or_none()
        products = chem_by_target.get(agent_name, [])
        if rec is None or not products:
            continue

        chem = products[0]
        applied_at = rec.created_at + timedelta(days=2, hours=rng.randint(0, 3))
        await add_program(
            gh,
            [chem],
            applied_at,
            bed_code=rec.bed_code,
            recommendation_id=rec.id,
            note=f"Applied against {agent_name} following the scouting recommendation.",
        )
        rec.recommended_chemical_id = chem.id
        if rec.status in ("open", "planned"):
            rec.status = "actioned"

    # 2. Routine preventative cover elsewhere, so the spray reports have body.
    #    Modes of action alternate per block — seeded data that would trip the
    #    farm's own resistance rule is not a demo, it's an embarrassment.
    rotation = [
        chem_by_target["Downy Mildew"][0],
        chem_by_target["Botrytis"][0],
        chem_by_target["Botrytis"][1],
        chem_by_target["Spider Mites"][1],
    ]
    for idx, gh in enumerate(greenhouses):
        if idx in ARCS:
            continue
        for n in range(rng.randint(1, 2)):
            chem = rotation[(idx + n) % len(rotation)]
            applied_at = now - timedelta(days=26 - n * 14, hours=rng.randint(5, 9))
            await add_program(
                gh,
                [chem],
                applied_at,
                bed_code=None,
                recommendation_id=None,
                note="Routine preventative cover.",
            )

    db.add_all(sprays)
    await db.flush()

    # ── Outcomes ────────────────────────────────────────────────────────────
    # Now that the treatments exist and their recommendations are 'actioned',
    # replay the re-scouts so each one lands a verdict: recovered, recovering,
    # or not responding. A clean re-scout is what *resolves* a recommendation,
    # so severity-0 records must be replayed too — but only for blocks that
    # actually carry a recommendation, which spares ~2,000 pointless queries.
    watched = set(
        (
            await db.execute(
                select(Recommendation.greenhouse_id).where(
                    Recommendation.greenhouse_id.isnot(None)
                )
            )
        ).scalars().all()
    )
    for entry in records:
        if entry.greenhouse_id in watched:
            await evaluate_outcome(db, entry)

    await db.commit()
    return True
