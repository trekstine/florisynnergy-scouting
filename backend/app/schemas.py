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
    created_at: datetime | None = None


class BedCreate(BaseModel):
    code: str = Field(max_length=50)
    boundary: list[Coordinate] | None = Field(default=None, min_length=3)
    centroid_lat: float | None = None
    centroid_lng: float | None = None


class BedBulkCreate(BaseModel):
    """Generate "Bed 1" … "Bed N" in one call — blocks run to 20+ beds."""

    count: int = Field(ge=1, le=200)
    start: int = 1
    prefix: str = Field(default="Bed ", max_length=30)


class BedOut(BaseModel):
    id: int
    greenhouse_id: int
    code: str
    boundary: list[Coordinate] | None = None
    centroid_lat: float | None
    centroid_lng: float | None


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
    agents: list[str] = []
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
