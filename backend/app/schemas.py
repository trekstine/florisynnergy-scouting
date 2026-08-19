"""Pydantic v2 request/response models."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

Coordinate = Annotated[list[float], Field(min_length=2, max_length=2)]
RoleLiteral = Literal["scout", "supervisor", "admin"]
ScoutingForLiteral = Literal["disease", "pest", "lure", "sticky_trap"]
VerificationLiteral = Literal["gps", "qr_code", "pin_bypass", "manual"]
RecStatusLiteral = Literal["open", "planned", "actioned", "resolved"]


# ───────── Auth ─────────
class LoginRequest(BaseModel):
    device_identifier: str
    pin: str = Field(min_length=4, max_length=12)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    employee_id: int
    name: str
    role: RoleLiteral


class EmployeeCreate(BaseModel):
    name: str = Field(max_length=150)
    role: RoleLiteral
    device_identifier: str | None = Field(default=None, max_length=100)
    pin: str | None = Field(default=None, min_length=4, max_length=12)


class EmployeeUpdate(BaseModel):
    name: str | None = None
    role: RoleLiteral | None = None
    device_identifier: str | None = None
    is_active: bool | None = None
    pin: str | None = Field(default=None, min_length=4, max_length=12)


class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    role: RoleLiteral
    device_identifier: str | None
    is_active: bool


# ───────── Farms / Greenhouses / Beds ─────────
class FarmCreate(BaseModel):
    name: str = Field(max_length=150)
    code: str | None = Field(default=None, max_length=50)


class FarmOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    code: str | None


class GreenhouseCreate(BaseModel):
    name: str = Field(max_length=100)
    qr_code_hash: str = Field(max_length=255)
    boundary: list[Coordinate] = Field(min_length=3)
    farm_id: int | None = None
    code: str | None = Field(default=None, max_length=50)


class GreenhouseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    qr_code_hash: str | None = Field(default=None, max_length=255)
    boundary: list[Coordinate] | None = Field(default=None, min_length=3)
    code: str | None = None


class GreenhouseOut(BaseModel):
    id: int
    farm_id: int | None
    name: str
    code: str | None
    qr_code_hash: str
    boundary: list[Coordinate]
    bed_count: int = 0
    # Hectares, from the polygon. Fertigation divides water by the summed area
    # of the blocks fed, so this has to travel with the greenhouse.
    area_ha: float | None = None
    phase_id: int | None = None
    created_at: datetime | None = None


class BedCreate(BaseModel):
    code: str = Field(max_length=50)
    boundary: list[Coordinate] | None = Field(default=None, min_length=3)
    centroid_lat: float | None = None
    centroid_lng: float | None = None


class BedBulkCreate(BaseModel):
    """Register a run of beds in one call — blocks run to 20+ beds.

    Either send the exact ``codes`` — which lets a client show a preview that
    is guaranteed to match what gets created, including naming that is not
    ``prefix + number`` like "Bed A" — or send count/start/prefix and let the
    server generate them.
    """

    codes: list[str] | None = None
    count: int = Field(default=1, ge=1, le=200)
    start: int = 1
    prefix: str = Field(default="Bed ", max_length=30)


class BedOut(BaseModel):
    id: int
    greenhouse_id: int
    code: str
    boundary: list[Coordinate] | None = None
    centroid_lat: float | None
    centroid_lng: float | None
    # Scouting records that name this bed. Removing a bed that scouts have
    # walked orphans history, so the count travels with the bed and the UI
    # can say what is at stake before anyone clicks.
    records: int = 0


class BedBulkDelete(BaseModel):
    """Remove several beds at once — the fix for a run generated wrongly."""

    # Omit to clear every bed on the block.
    bed_ids: list[int] | None = None


# ───────── Reference data ─────────
class VarietyCreate(BaseModel):
    code: str = Field(max_length=50)
    name: str = Field(max_length=150)
    crop: str = "rose"
    color: str | None = None


class VarietyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    crop: str
    color: str | None
    is_active: bool


class PestCreate(BaseModel):
    name: str = Field(max_length=150)
    category: str | None = None
    threshold: int = 3


class PestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    category: str | None
    threshold: int
    pressure_threshold: float = 0.5
    is_active: bool


class PestUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    category: str | None = None
    threshold: int | None = Field(default=None, ge=1, le=5)
    pressure_threshold: float | None = Field(default=None, ge=0.05, le=5)
    is_active: bool | None = None
    reason: str | None = None  # audit note for a threshold change


class DiseaseCreate(BaseModel):
    name: str = Field(max_length=150)
    threshold: int = 3


class DiseaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    threshold: int
    pressure_threshold: float = 0.5
    is_active: bool


class DiseaseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    threshold: int | None = Field(default=None, ge=1, le=5)
    pressure_threshold: float | None = Field(default=None, ge=0.05, le=5)
    is_active: bool | None = None
    reason: str | None = None  # audit note for a threshold change


# ───────── ETL override rules ─────────
class EtlRuleCreate(BaseModel):
    pest_id: int | None = None
    disease_id: int | None = None
    variety_id: int | None = None
    greenhouse_id: int | None = None
    threshold: int = Field(ge=1, le=5)
    market: str | None = Field(default=None, max_length=80)
    reason: str | None = None


class EtlRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    pest_id: int | None
    disease_id: int | None
    variety_id: int | None
    greenhouse_id: int | None
    threshold: int
    market: str | None
    reason: str | None
    created_by: int | None
    created_at: datetime


class EtlAuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: int | None
    entity: str
    entity_id: int | None
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    reason: str | None
    summary: str | None
    created_at: datetime


class ChemicalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    product: str | None
    type_of_application: str | None = None
    rate: str | None = None
    who_class: str | None
    rac_code: str | None
    active_ingredient1: str | None
    target1: str | None
    target2: str | None = None
    rei: str | None
    buying_price: float | None
    rate_per_ha: float | None = None
    water_rate_l_per_ha: float | None = None
    phi_days: int | None = None


class ChemicalImportResult(BaseModel):
    """Outcome of pulling the master list from the legacy FloriSynergy API."""

    fetched: int
    created: int
    updated: int
    skipped: int
    # Imported without rate/ha or PHI — the spray builder can't price these
    # until an agronomist fills them in.
    needs_agronomy: list[str]
    errors: list[str]


# ───────── Scouting capture (offline batch) ─────────
class ScoutingEntry(BaseModel):
    client_record_id: str = Field(description="Device-generated idempotency UUID")
    greenhouse_id: int | None = None
    bed_id: int | None = None
    bed_code: str | None = None
    scouting_for: ScoutingForLiteral
    variety_id: int | None = None
    variety_code: str | None = None
    pest_id: int | None = None
    disease_id: int | None = None
    lure_id: str | None = None
    sticky_trap_id: str | None = None
    stage: str | None = None
    location_on_plant: str | None = None
    severity: int = 0
    fcm_count: int = 0
    sticky_trap_bug_count: int = 0
    lure_bug_count: int = 0
    beneficials_count: int = 0
    notes: str | None = None
    image_url: str | None = None
    gps_lat: float | None = None
    gps_lng: float | None = None
    verification_method: VerificationLiteral = "gps"
    recorded_at: datetime


class ScoutingBatch(BaseModel):
    """Multiple entries captured in one session, submitted at once."""

    batch_id: str | None = None
    # Optional session-level remark the scout adds once, on submit; stored
    # on every entry in the batch.
    comments: str | None = None
    entries: list[ScoutingEntry] = Field(min_length=1)


class ScoutingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    batch_id: str | None
    greenhouse_id: int | None
    bed_code: str | None
    scout_id: int | None
    scouting_for: ScoutingForLiteral
    variety_code: str | None
    pest_id: int | None
    disease_id: int | None
    stage: str | None
    location_on_plant: str | None
    severity: int
    fcm_count: int
    sticky_trap_bug_count: int
    lure_bug_count: int
    beneficials_count: int
    notes: str | None
    session_comment: str | None = None
    image_url: str | None
    gps_lat: float | None
    gps_lng: float | None
    verification_method: VerificationLiteral
    flagged: bool = False
    flag_reason: str | None = None
    recorded_at: datetime


class BatchResult(BaseModel):
    accepted: list[str]
    duplicates: list[str]
    rejected: dict[str, str]
    recommendations_created: int = 0


# ───────── Spray ─────────
class SprayEntry(BaseModel):
    client_record_id: str
    recommendation_id: int | None = None
    greenhouse_id: int | None = None
    bed_code: str | None = None
    variety_code: str | None = None
    chemical_id: int | None = None
    product: str | None = None
    type_of_application: str | None = None
    rate: str | None = None
    volume_of_water: str | None = None
    coverage: str | None = None
    qty: float | None = None
    buying_price: float | None = None
    cost_of_chemical: float | None = None
    comments: str | None = None
    start_date: date | None = None
    start_time: time | None = None
    recorded_at: datetime


class SprayBatch(BaseModel):
    program_id: str | None = None
    entries: list[SprayEntry] = Field(min_length=1)


class SprayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    program_id: str | None
    recommendation_id: int | None
    greenhouse_id: int | None
    bed_code: str | None
    partition_no: str | None = None
    variety_code: str | None
    product: str | None
    type_of_application: str | None = None
    rate: str | None
    volume_of_water: str | None = None
    coverage: str | None
    who_class: str | None
    rac_code: str | None = None
    rei: str | None = None
    # Needed by the approval sheet: an approver signs off on the active
    # ingredient and target, not just a trade name.
    active_ingredient1: str | None = None
    active_ingredient2: str | None = None
    target1: str | None = None
    target2: str | None = None
    chemical_id: int | None = None
    scout_id: int | None = None
    area_ha: float | None = None
    qty: float | None
    buying_price: float | None = None
    cost_of_chemical: float | None
    phi_days: int | None
    safe_harvest_date: date | None
    comments: str | None = None
    start_date: date | None
    start_time: time | None = None
    scout_report_date: date | None = None
    scout_report_end_date: date | None = None
    program_status: str = "planned"
    applied_at: datetime | None = None
    reviewed_at: datetime | None = None
    review_comment: str | None = None
    effectiveness: str | None = None
    recorded_at: datetime


class ScoutingDetail(BaseModel):
    """One observation with everything a manager needs on a single page.

    Resolves the foreign keys to names, places the record in its scouting
    session, and — the part that closes the loop — carries the recommendation
    it raised and any spray program that answered it.
    """

    record: ScoutingOut
    greenhouse: str | None = None
    greenhouse_code: str | None = None
    pest: str | None = None
    disease: str | None = None
    variety: str | None = None
    scout: str | None = None

    # The session this was captured in (one scout, one round, one batch).
    session_records: int = 0
    session_beds: int = 0
    session_started_at: datetime | None = None
    session_ended_at: datetime | None = None

    # Observation → recommendation → spray.
    recommendation_id: int | None = None
    recommendation_note: str | None = None
    recommendation_status: str | None = None
    recommendation_outcome: str | None = None
    sprays: list[SprayOut] = []

    # Previous readings of the same agent on the same bed, oldest first.
    history: list[dict] = []


class SprayStatusUpdate(BaseModel):
    """Move a program along: planned → applied → reviewed."""

    status: Literal["planned", "applied", "reviewed"]
    applied_at: datetime | None = None
    review_comment: str | None = None
    # The human read on whether it worked, recorded alongside the engine's.
    effectiveness: Literal["effective", "partial", "ineffective"] | None = None


class SprayAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    program_id: str
    filename: str
    url: str
    content_type: str | None = None
    size_bytes: int | None = None
    kind: str | None = None
    note: str | None = None
    uploaded_by: int | None = None
    uploaded_at: datetime


class SprayAttachmentCreate(BaseModel):
    """Register a file already uploaded via /media/upload against a program."""

    filename: str = Field(max_length=255)
    url: str = Field(max_length=500)
    content_type: str | None = None
    size_bytes: int | None = None
    kind: str | None = Field(default=None, max_length=40)
    note: str | None = None


class ProgramSummary(BaseModel):
    """A spray program as seen from the scouting side of the loop."""

    program_id: str
    greenhouse_id: int | None = None
    greenhouse: str | None = None
    bed_code: str | None = None
    start_date: date | None = None
    products: list[str] = []
    total_cost: float = 0
    program_status: str = "planned"
    safe_harvest_date: date | None = None
    recommendation_id: int | None = None
    attachments: int = 0


class RoundSummary(BaseModel):
    """One scouting round — the thing a farm calls a scouting report."""

    batch_id: str
    greenhouse_id: int | None = None
    greenhouse: str | None = None
    greenhouse_code: str | None = None
    scout_id: int | None = None
    scout: str | None = None
    started_at: datetime
    ended_at: datetime
    records: int
    beds: int
    findings: int
    max_severity: int
    session_comment: str | None = None
    # Every agent named in the round's findings, kept both blended (for a
    # one-line summary) and split, because a manager filters on one or the
    # other and a mixed list cannot answer "show me the mildew rounds".
    agents: list[str] = []
    pests: list[str] = []
    diseases: list[str] = []
    varieties: list[str] = []
    # Beds walked that came back with nothing — the denominator of the
    # pressure index, and the number that says how thorough the walk was.
    clean_beds: int = 0
    # Findings at severity 4+, where the Interplant model says act regardless
    # of the block average.
    hotspots: int = 0
    beneficials: int = 0
    photos: int = 0
    flagged: int = 0
    duration_minutes: int = 0
    programs: int = 0


class RoundDetail(BaseModel):
    round: RoundSummary
    entries: list[ScoutingOut] = []
    recommendations: list[dict] = []
    programs: list[ProgramSummary] = []


class SprayFromRec(BaseModel):
    """Generate a spray program directly from a recommendation."""

    chemical_id: int | None = None  # defaults to the rec's assigned chemical
    coverage: str | None = None
    comments: str | None = None
    start_date: date | None = None  # defaults to today
    override: bool = False  # proceed despite a blocking compliance issue


# ───────── Compliance ─────────
class ComplianceIssue(BaseModel):
    level: Literal["block", "warn", "info"]
    code: str
    message: str


class ComplianceResult(BaseModel):
    issues: list[ComplianceIssue]
    blocked: bool


# ───────── Spray program builder ─────────
class SprayPreviewRequest(BaseModel):
    """Ask the server what a product would cost and constrain, without saving.

    Dosing, PHI arithmetic and compliance checks all live server-side; this
    lets the UI show them *before* anyone commits, instead of composing a
    record invisibly on submit.
    """

    chemical_id: int
    greenhouse_id: int | None = None
    bed_code: str | None = None
    variety_code: str | None = None
    coverage: str | None = None
    start_date: date | None = None
    pest_id: int | None = None
    disease_id: int | None = None
    # Spray-sheet dosing: rate is per 100 L of water. When both are given the
    # quantity comes from the tank, not from the block's hectares.
    volume_of_water_l: float | None = Field(default=None, gt=0)
    rate: float | None = Field(default=None, gt=0)


class SprayPreviewOut(BaseModel):
    chemical_id: int
    name: str
    product: str | None
    type_of_application: str | None
    rate: str | None
    area_ha: float | None
    qty: float | None
    volume_of_water: str | None
    buying_price: float | None
    cost_of_chemical: float | None
    who_class: str | None
    rac_code: str | None
    active_ingredient1: str | None
    target1: str | None
    target2: str | None
    rei: str | None
    phi_days: int | None
    safe_harvest_date: date | None
    issues: list[ComplianceIssue]
    blocked: bool


class SprayProgramItem(BaseModel):
    chemical_id: int
    # Product per 100 L of water, as written on the spray sheet.
    rate: float | None = Field(default=None, gt=0)


class SprayProgramCreate(BaseModel):
    """One application event spanning one or more tank-mixed products.

    Mirrors the FloriSynergy spray sheet: the block, tank and timing are
    shared across the mix; each product carries its own rate.
    """

    greenhouse_id: int | None = None
    bed_code: str | None = None
    partition_no: str | None = None
    variety_code: str | None = None
    type_of_application: str | None = None
    coverage: str | None = None
    rei: str | None = None
    volume_of_water_l: float | None = Field(default=None, gt=0)
    comments: str | None = None
    start_date: date | None = None
    start_time: time | None = None
    scout_report_date: date | None = None
    scout_report_end_date: date | None = None
    recommendation_id: int | None = None
    items: list[SprayProgramItem] = Field(min_length=1)
    override: bool = False


class SprayProgramOut(BaseModel):
    program_id: str
    records: list[SprayOut]
    total_cost: float
    safe_harvest_date: date | None


# ───────── Analytics ─────────
class KpiDelta(BaseModel):
    value: float
    previous: float
    delta_pct: float | None  # vs previous equal-length period


class AnalyticsSummary(BaseModel):
    start: date
    end: date
    records: KpiDelta
    avg_severity: KpiDelta
    over_threshold: KpiDelta
    open_recommendations: int
    active_scouts: KpiDelta
    spray_cost: KpiDelta
    beneficials: int
    by_type: dict[str, int]  # disease/pest/lure/sticky_trap counts


class TrendPoint(BaseModel):
    date: date
    records: int
    avg_severity: float
    over_threshold: int


class BreakdownRow(BaseModel):
    key: str
    records: int
    avg_severity: float
    over_threshold: int
    # Beds where this pest/disease/variety was seen — surfaced on hover so a
    # manager can go straight to the location, not just the count.
    beds: list[str] = []


class AgentTrendPoint(BaseModel):
    """One day's reading for one pest or disease."""

    date: date
    agent_kind: Literal["pest", "disease"]
    agent_name: str
    records: int
    avg_severity: float
    max_severity: int


class SeverityBucket(BaseModel):
    severity: int
    count: int


class AgentPressure(BaseModel):
    """Per-greenhouse, per-agent pressure — the Interplant model.

    Pests and diseases are never blended into one greenhouse number: each
    agent carries its own index (Σ per-bed severity ÷ beds scouted, with
    unobserved beds counting as 0), its own ETL, and its own hotspot flag.
    """

    greenhouse_id: int
    agent_kind: Literal["pest", "disease"]
    agent_id: int
    agent_name: str
    records: int
    beds_observed: int
    beds_scouted: int  # the denominator: distinct beds visited in range
    total_severity: int
    pressure_index: float
    max_severity: int
    hotspot_bed: str | None  # bed carrying the worst observation
    pressure_threshold: float
    over_etl: bool  # pressure_index ≥ configured pressure ETL
    hotspot: bool  # any single observation at/above severity 4
    action_required: bool  # over_etl OR hotspot


class GreenhousePressure(BaseModel):
    greenhouse_id: int
    name: str
    centroid: list[float]
    boundary: list[Coordinate]
    records: int
    max_severity: int
    avg_severity: float
    over_threshold: int
    pressure: Literal["none", "low", "medium", "high"]
    # Worst active issue, e.g. "Powdery Mildew severity 4 on Bed 4" — the
    # band's one-line justification. None when the block is quiet.
    headline: str | None = None


class ObservationPoint(BaseModel):
    lat: float
    lng: float
    severity: int
    scouting_for: ScoutingForLiteral
    greenhouse_id: int | None


class BedPressure(BaseModel):
    bed_code: str
    records: int
    avg_severity: float
    max_severity: int
    over_threshold: int
    pressure: Literal["none", "low", "medium", "high"]


class PestMatrixCell(BaseModel):
    """One cell of the pest/disease × greenhouse matrix.

    Diseases sit alongside pests here — they're different agents but the
    manager reads them on the same grid, so `kind` distinguishes them.
    """

    pest: str  # agent name (pest or disease)
    kind: Literal["pest", "disease"] = "pest"
    greenhouse: str
    records: int
    avg_severity: float


class ScoutSummary(BaseModel):
    scout_id: int
    name: str
    records: int
    greenhouses_visited: int
    beds_visited: int = 0
    last_seen: datetime | None


class MovementStop(BaseModel):
    """One uninterrupted spell at a single bed.

    Consecutive records at the same bed collapse into one stop; the scout is
    considered to have left when their next record lands somewhere else.
    """

    started_at: datetime
    ended_at: datetime
    minutes: float | None
    greenhouse_id: int | None
    greenhouse: str
    bed_code: str | None
    records: int
    max_severity: int
    agents: list[str] = []


class MovementDay(BaseModel):
    date: date
    records: int
    beds: int
    greenhouses: list[str] = []
    first_seen: datetime
    last_seen: datetime
    active_minutes: float
    stops: list[MovementStop] = []


class ScoutMovement(BaseModel):
    scout_id: int
    name: str
    days: list[MovementDay] = []
    total_records: int = 0
    total_beds: int = 0
    active_minutes: float = 0
    median_minutes_per_bed: float | None = None


class SprayCostRow(BaseModel):
    greenhouse: str
    programs: int
    products: int
    total_cost: float


# ───────── Recommendations ─────────
class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    greenhouse_id: int | None
    bed_code: str | None
    pest_id: int | None
    disease_id: int | None
    recommended_chemical_id: int | None
    status: RecStatusLiteral
    trigger_severity: int
    baseline_severity: int | None
    post_severity: int | None
    effective_threshold: int | None
    threshold_source: str | None
    note: str | None
    outcome_note: str | None
    reopened_count: int
    created_at: datetime
    resolved_at: datetime | None


class RecommendationUpdate(BaseModel):
    status: RecStatusLiteral | None = None
    recommended_chemical_id: int | None = None
    note: str | None = None


class RecommendationCreate(BaseModel):
    """Manager-initiated intervention from a scouting observation."""

    greenhouse_id: int
    bed_code: str | None = None
    pest_id: int | None = None
    disease_id: int | None = None
    trigger_severity: int = 0
    note: str | None = None


class RecommendationVerify(BaseModel):
    note: str | None = None  # optional reasoned outcome


class RecommendationReopen(BaseModel):
    reason: str | None = None


OutcomeVerdict = Literal[
    "no_data", "resolved_ready", "recovering", "not_responding"
]


class RecommendationOutcome(BaseModel):
    """How a block responded after an intervention was raised."""

    recommendation_id: int
    baseline_severity: int | None
    latest_severity: int | None
    latest_observed_at: datetime | None
    observations_since: int  # re-scouts after the rec was raised
    effective_threshold: int
    delta: int | None  # latest − baseline (negative = improving)
    verdict: OutcomeVerdict


# ─────────────────── Credible Blooms integration (compat) ────────────────────
# The Blooms app speaks in names, not ids, and groups a whole walk into one
# submission. These models describe that dialect exactly so the app needs no
# reshaping — the translation happens here, once.


class BloomsItem(BaseModel):
    """One observation inside a submitted session."""

    model_config = ConfigDict(extra="ignore")

    pest: str | None = None
    disease: str | None = None
    bed: str | None = None
    variety: str | None = None
    score: str | int | None = None
    notes: str | None = None
    stage: str | None = None
    location: str | None = None
    locationonplant: str | None = None
    pestseverity: str | int | None = None
    diseaseseverity: str | int | None = None
    stickytrapbugcount: str | int | None = None
    luresbugcount: str | int | None = None
    bufferzonecount: str | int | None = None
    fcmcount: str | int | None = None
    beneficialscount: str | int | None = None
    lureid: str | None = None
    stickytrapid: str | None = None
    imageurl: str | None = None


class BloomsSession(BaseModel):
    """A whole scouting walk, exactly as the Blooms app posts it today."""

    model_config = ConfigDict(extra="ignore")

    scoutingfor: str
    scout: str | None = None
    location: str | None = None  # greenhouse, by name
    comments: str | None = None
    partition: str | None = None
    variety: str | None = None
    recorded_at: datetime | None = None
    items: list[BloomsItem] = []


class BloomsIngestResult(BaseModel):
    """What the portal made of a submission — including what it could not place."""

    batch_id: str
    accepted: int
    scout_id: int | None = None
    greenhouse_id: int | None = None
    recommendations_created: int = 0
    # kind → the names that could not be resolved, e.g. {"pest": ["Red Spider"]}
    unmatched: dict[str, list[str]] = {}


class BloomsRecord(BaseModel):
    """A portal record rendered back in the Blooms app's own JSON shape.

    Deliberately all-strings: the app's ``ScoutingData.fromJson`` was written
    against a PHP API that returns strings for everything, and it stays working
    untouched.
    """

    recordid: str
    activity: str = "Scouting"
    variety: str = ""
    scout: str = ""
    location: str = ""
    comments: str = ""
    bed: str = ""
    partitionno: str = ""
    stickytrapid: str = ""
    lureid: str = ""
    scoutingfor: str = ""
    pestname: str = ""
    pestseverity: str = "0"
    diseasename: str = ""
    diseaseseverity: str = "0"
    fcmcount: str = "0"
    stickytrapbugcount: str = "0"
    luresbugcount: str = "0"
    beneficialscount: str = "0"
    stage: str = ""
    locationonplant: str = ""
    notes: str = ""
    imageurl: str = ""
    createdtime: str = ""
    # Portal extras the app can start using without breaking the old parser.
    batchid: str = ""
    greenhouseid: str = ""


class AliasIn(BaseModel):
    """Map a name a partner app uses onto the reference row it means."""

    kind: Literal["greenhouse", "pest", "disease", "variety"]
    alias: str
    target_id: int
    source: str = "blooms"


class AliasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    alias: str
    target_id: int
    source: str
    hits: int


class UnmatchedName(BaseModel):
    """A name seen on the wire that the portal could not place."""

    kind: str
    alias: str
    hits: int
    source: str


# ──────────────────────────── Approval signing ───────────────────────────────
RoleLiteral = Literal["scout", "supervisor", "admin"]


class ApprovalSlotIn(BaseModel):
    """A signature line on the approval sheet."""

    document_type: str = Field(default="spray_program", max_length=40)
    label: str = Field(max_length=80)
    hint: str | None = Field(default=None, max_length=200)
    position: int = 0
    farm_id: int | None = None
    required_role: RoleLiteral | None = None
    is_required: bool = True
    is_active: bool = True


class ApprovalSlotUpdate(BaseModel):
    document_type: str | None = Field(default=None, max_length=40)
    label: str | None = Field(default=None, max_length=80)
    hint: str | None = Field(default=None, max_length=200)
    position: int | None = None
    required_role: RoleLiteral | None = None
    is_required: bool | None = None
    is_active: bool | None = None


class ApprovalSlotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    farm_id: int | None
    document_type: str
    label: str
    hint: str | None
    position: int
    required_role: str | None
    is_required: bool
    is_active: bool


class SignatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slot_id: int | None
    slot_label: str
    employee_id: int | None
    signer_name: str
    signer_role: str | None
    image_url: str | None
    content_hash: str
    signed_at: datetime
    ip_address: str | None
    voided_at: datetime | None
    void_reason: str | None


class SignRequest(BaseModel):
    """Apply a signature. The PIN is the re-authentication.

    Asking again at the moment of signing is the point: a session left open on
    a shared office machine should not be able to approve a spray.
    """

    slot_id: int
    pin: str
    # A PNG data URL of the drawn mark, e.g. "data:image/png;base64,iVBOR…".
    signature_image: str | None = None


class VoidRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class SignatureSlotState(BaseModel):
    """One line on the sheet, and whoever has signed it."""

    slot: ApprovalSlotOut
    signature: SignatureOut | None = None


class ApprovalState(BaseModel):
    """Everything the approval sheet needs to render and to be trusted."""

    document_type: str
    document_id: str
    slots: list[SignatureSlotState]
    # Signatures whose slot has since been deleted — still part of the record.
    orphan_signatures: list[SignatureOut] = []
    current_hash: str
    # The hash as it was at the first signature. Null when nothing is signed.
    signed_hash: str | None = None
    # False means the content changed after it was signed.
    intact: bool = True
    locked: bool = False
    complete: bool = False
    signed_count: int = 0
    required_count: int = 0


# ───────────────────────────── Fertigation ──────────────────────────────────
ActivityLiteral = Literal["fertigation", "drenching", "flushing"]
FertStatusLiteral = Literal["draft", "issued", "completed", "cancelled"]


class FertiliserIn(BaseModel):
    code: str = Field(max_length=40)
    name: str = Field(max_length=150)
    formula: str | None = Field(default=None, max_length=60)
    unit: str = Field(default="kg", max_length=10)
    price_per_unit: float | None = None
    default_tank: str | None = Field(default=None, max_length=10)
    is_acid: bool = False
    is_organic: bool = False
    pct_n: float | None = None
    pct_p: float | None = None
    pct_k: float | None = None
    pct_ca: float | None = None
    pct_mg: float | None = None
    pct_s: float | None = None
    is_active: bool = True


class FertiliserOut(FertiliserIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class FertigationLineIn(BaseModel):
    fertiliser_id: int | None = None
    fertiliser_code: str = Field(max_length=40)
    fertiliser_name: str | None = Field(default=None, max_length=150)
    quantity: float = 0.0
    unit: str = Field(default="kg", max_length=10)
    position: int = 0


class FertigationLineOut(FertigationLineIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_acid: bool = False
    unit_price: float | None = None
    cost: float | None = None


class FertigationTankIn(BaseModel):
    code: str = Field(max_length=10)
    volume_l: float = 1000.0
    # "auto" derives the set count from the water volume; "manual" means the
    # operator confirmed a different approved count.
    sets_mode: Literal["auto", "manual"] = "auto"
    sets: float = 1.0
    note: str | None = Field(default=None, max_length=200)
    lines: list[FertigationLineIn] = []


class FertigationTankOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    volume_l: float
    sets_mode: str = "auto"
    # What is on the record. `effective_sets` is what the figures actually use.
    sets: float
    note: str | None = None
    lines: list[FertigationLineOut] = []
    # The count the water volume calls for, and the one in force. They differ
    # only when somebody has overridden the derivation.
    implied_sets: float = 0.0
    effective_sets: float = 0.0
    is_acid_tank: bool = False
    # Quantity × effective sets, summed — what leaves the store for this tank.
    total_cost: float = 0.0


class FertigationSourceIn(BaseModel):
    source: str = Field(max_length=30)
    volume_m3: float | None = None
    ec: float | None = None
    ph: float | None = None
    note: str | None = Field(default=None, max_length=200)


class FertigationSourceOut(FertigationSourceIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class PhaseIn(BaseModel):
    """An irrigation phase and the blocks fed from it."""

    code: str = Field(max_length=30)
    name: str = Field(max_length=100)
    note: str | None = Field(default=None, max_length=200)
    position: int = 0
    is_active: bool = True
    farm_id: int | None = None
    # The greenhouses on this phase. Sent whole — the mapping is edited as a
    # set, not one block at a time.
    greenhouse_ids: list[int] = []


class PhaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    farm_id: int | None
    code: str
    name: str
    note: str | None
    position: int
    is_active: bool
    greenhouse_ids: list[int] = []
    greenhouses: list[str] = []
    area_ha: float = 0.0


class FertigationBlockIn(BaseModel):
    greenhouse_id: int
    # Optional override; otherwise the greenhouse's registered area is used.
    area_ha: float | None = None
    volume_m3: float | None = None


class FertigationBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    greenhouse_id: int | None
    name: str
    code: str | None
    area_ha: float | None
    volume_m3: float | None
    position: int
    m3_per_ha: float | None = None


class FertigationIn(BaseModel):
    """Everything the sheet captures. Tanks and sources come with it."""

    activity: ActivityLiteral = "fertigation"
    event_date: date
    effective_from: date | None = None
    start_time: str | None = Field(default=None, max_length=10)
    phase_id: int | None = None
    phase: str | None = Field(default=None, max_length=60)
    # The greenhouses fed. Area is summed over these — BR-001.
    blocks: list[FertigationBlockIn] = []
    type_of_application: str | None = Field(default=None, max_length=60)
    volume_m3: float | None = None
    area_ha: float | None = None
    # Plan the water instead of measuring it: m³ = target × summed block area.
    target_m3_per_ha: float | None = None
    weather: str | None = Field(default=None, max_length=80)
    fertiliser_rate_l_m3: float = 6.0
    acid_rate_l_m3: float = 2.0
    applicator_id: int | None = None
    comments: str | None = None
    status: FertStatusLiteral = "draft"
    reference: str | None = Field(default=None, max_length=40)
    tanks: list[FertigationTankIn] = []
    sources: list[FertigationSourceIn] = []


class FertigationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doc_id: str
    reference: str | None = None
    activity: str
    event_date: date
    effective_from: date | None = None
    start_time: str | None = None
    phase_id: int | None = None
    phase: str | None = None
    blocks: list[FertigationBlockOut] = []
    # A one-line summary of the blocks, for lists and headings.
    blocks_label: str | None = None
    type_of_application: str | None = None
    volume_m3: float | None = None
    area_ha: float | None = None
    target_m3_per_ha: float | None = None
    weather: str | None = None
    fertiliser_rate_l_m3: float
    acid_rate_l_m3: float
    applicator_id: int | None = None
    applicator: str | None = None
    prepared_by: int | None = None
    prepared_by_name: str | None = None
    comments: str | None = None
    status: str
    created_at: datetime

    tanks: list[FertigationTankOut] = []
    sources: list[FertigationSourceOut] = []

    # ── Derived, so every screen shows the same arithmetic ──
    total_cost: float = 0.0
    # Stock solution the injection rate calls for, in litres, and the sets that
    # implies at the tank volume in use.
    stock_required_l: float = 0.0
    acid_required_l: float = 0.0
    m3_per_ha: float | None = None
    # What the recorded sources add up to, and a note when that disagrees with
    # the water applied.
    sources_total_m3: float = 0.0
    source_note: str | None = None
    blocks_total_m3: float = 0.0
    block_note: str | None = None
    # What the target rate calls for over the blocks selected — the report's
    # "m³ used = 33.33 × greenhouse area", summed.
    planned_m3: float | None = None
    signature_count: int = 0


# ───────── Fertigation analytics ─────────
class FertigationCostRow(BaseModel):
    """Feeding cost and water, grouped one way or another.

    ``key`` is whatever the grouping is — a phase name, a block name, a month.
    Costs carry the prices stored on the sheet at the time it was raised, not
    today's, so a repriced fertiliser cannot restate last season's spend.
    """

    key: str
    sheets: int
    volume_m3: float
    area_ha: float
    m3_per_ha: float | None = None
    total_cost: float


class FertigationUsageRow(BaseModel):
    """How much of one product went out, across every sheet in range."""

    code: str
    name: str | None = None
    unit: str
    quantity: float
    tanks: int
    sheets: int
    total_cost: float


class FertigationWaterRow(BaseModel):
    """Water applied against the rate that was planned, per sheet.

    ``target_m3_per_ha`` is what the sheet asked for and ``m3_per_ha`` what the
    volume and area actually work out to. The gap between them is the point of
    the row — a phase consistently under its target is a phase being underfed.
    """

    doc_id: str
    reference: str | None = None
    event_date: date
    phase: str | None = None
    blocks: str | None = None
    area_ha: float | None = None
    volume_m3: float | None = None
    m3_per_ha: float | None = None
    target_m3_per_ha: float | None = None
    variance_pct: float | None = None
    total_cost: float
    status: str
