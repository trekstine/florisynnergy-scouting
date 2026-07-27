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
    is_active: bool


class PestUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    category: str | None = None
    threshold: int | None = Field(default=None, ge=1, le=5)
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
    is_active: bool


class DiseaseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    threshold: int | None = Field(default=None, ge=1, le=5)
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
    who_class: str | None
    rac_code: str | None
    active_ingredient1: str | None
    target1: str | None
    rei: str | None
    buying_price: float | None


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
    variety_code: str | None
    product: str | None
    rate: str | None
    coverage: str | None
    who_class: str | None
    qty: float | None
    cost_of_chemical: float | None
    phi_days: int | None
    safe_harvest_date: date | None
    start_date: date | None
    recorded_at: datetime


class SprayFromRec(BaseModel):
    """Generate a spray program directly from a recommendation."""

    chemical_id: int | None = None  # defaults to the rec's assigned chemical
    coverage: str | None = None
    comments: str | None = None
    start_date: date | None = None  # defaults to today
    override: bool = False  # proceed despite a blocking compliance issue


class ComplianceIssue(BaseModel):
    level: Literal["block", "warn", "info"]
    code: str
    message: str


class ComplianceResult(BaseModel):
    issues: list[ComplianceIssue]
    blocked: bool


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


class SeverityBucket(BaseModel):
    severity: int
    count: int


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
    pest: str
    greenhouse: str
    records: int
    avg_severity: float


class ScoutSummary(BaseModel):
    scout_id: int
    name: str
    records: int
    greenhouses_visited: int
    last_seen: datetime | None


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
