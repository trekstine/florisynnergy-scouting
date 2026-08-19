"""SQLAlchemy ORM models for FloriSynergy Scouting.

Layers:
  * Geofencing core   — farms → greenhouses (polygons) → beds, employees.
  * Reference data     — varieties, pests, diseases, chemicals.
  * Field capture      — scouting records (4 types) + spray records, both
                         offline-batch friendly via a client-generated id.
  * Agronomy / Action  — pest/disease thresholds drive recommendations.
  * Audit              — geofence verification breadcrumbs.
"""
from __future__ import annotations

import enum
from datetime import date, datetime, time

from geoalchemy2 import Geometry
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(str, enum.Enum):
    scout = "scout"
    supervisor = "supervisor"
    admin = "admin"


class ScoutingFor(str, enum.Enum):
    disease = "disease"
    pest = "pest"
    lure = "lure"
    sticky_trap = "sticky_trap"


class VerificationMethod(str, enum.Enum):
    gps = "gps"
    qr_code = "qr_code"
    pin_bypass = "pin_bypass"
    manual = "manual"


class RecStatus(str, enum.Enum):
    open = "open"
    planned = "planned"
    actioned = "actioned"
    resolved = "resolved"


# ───────────────────────────── Geofencing core ──────────────────────────────
class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    greenhouses: Mapped[list["Greenhouse"]] = relationship(
        back_populates="farm", cascade="all, delete-orphan"
    )


class Phase(Base):
    """An irrigation phase — a group of greenhouses fed together.

    Master data rather than a typed label: the supplied records show Phase 1 as
    GH1, GH2, GH3, GH11 and Phase 2 as GH4 through GH10, and a fertigation is
    raised against the phase. Free text could not answer "which blocks did this
    feed", which is the question every downstream figure depends on.
    """

    __tablename__ = "phases"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int | None] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE")
    )
    code: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    note: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("farm_id", "code", name="uq_phase_farm_code"),)


class Greenhouse(Base):
    __tablename__ = "greenhouses"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int | None] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50))
    qr_code_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    boundary: Mapped[object] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
    )
    # Area in hectares (computed from the polygon via PostGIS on write).
    area_ha: Mapped[float | None] = mapped_column(Numeric(10, 4))
    # Which irrigation phase this block is fed from. A phase is a real piece of
    # plumbing — one pump, one set of stock tanks — so a fertigation covers a
    # phase, and the blocks on it are what actually got fed.
    phase_id: Mapped[int | None] = mapped_column(
        ForeignKey("phases.id", ondelete="SET NULL")
    )
    # Target market for the block — drives market-specific ETL rules.
    market: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    farm: Mapped["Farm"] = relationship(back_populates="greenhouses")
    beds: Mapped[list["Bed"]] = relationship(
        back_populates="greenhouse", cascade="all, delete-orphan"
    )


class Bed(Base):
    """Bed / bay within a greenhouse — the precision unit scouts report against."""

    __tablename__ = "beds"

    id: Mapped[int] = mapped_column(primary_key=True)
    greenhouse_id: Mapped[int] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    # Optional bed-level geofence; otherwise we fall back to the centroid point.
    boundary: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True)
    )
    centroid_lat: Mapped[float | None] = mapped_column(Float)
    centroid_lng: Mapped[float | None] = mapped_column(Float)

    __table_args__ = (
        UniqueConstraint("greenhouse_id", "code", name="uq_bed_gh_code"),
    )

    greenhouse: Mapped["Greenhouse"] = relationship(back_populates="beds")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    device_identifier: Mapped[str | None] = mapped_column(String(100), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    pin_hash: Mapped[str | None] = mapped_column(String(255))

    __table_args__ = (
        CheckConstraint(
            "role IN ('scout', 'supervisor', 'admin')", name="ck_employees_role"
        ),
    )


# ───────────────────────────── Reference data ───────────────────────────────
class Variety(Base):
    __tablename__ = "varieties"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    crop: Mapped[str] = mapped_column(String(50), default="rose")
    color: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Pest(Base):
    __tablename__ = "pests"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(80))
    # Economic threshold (ETL): severity at/above which an intervention is advised.
    threshold: Mapped[int] = mapped_column(Integer, default=3)
    # Pressure-index ETL: Σ(per-bed severity) ÷ beds scouted, per greenhouse.
    # A block-wide measure — distinct from `threshold`, which is per observation.
    pressure_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # True until an agronomist has set a real threshold. Provisional agents are
    # recorded, filtered and charted like any other — they just do not raise
    # recommendations, because the number that would trigger one is a guess.
    is_provisional: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Disease(Base):
    __tablename__ = "diseases"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    threshold: Mapped[int] = mapped_column(Integer, default=3)
    pressure_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # See Pest.is_provisional.
    is_provisional: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class Chemical(Base):
    __tablename__ = "chemicals"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    product: Mapped[str | None] = mapped_column(String(150))
    type_of_application: Mapped[str | None] = mapped_column(String(100))
    rate: Mapped[str | None] = mapped_column(String(50))
    who_class: Mapped[str | None] = mapped_column(String(20))
    rac_code: Mapped[str | None] = mapped_column(String(50))
    active_ingredient1: Mapped[str | None] = mapped_column(String(150))
    active_ingredient1_conc: Mapped[str | None] = mapped_column(String(50))
    active_ingredient2: Mapped[str | None] = mapped_column(String(150))
    active_ingredient2_conc: Mapped[str | None] = mapped_column(String(50))
    target1: Mapped[str | None] = mapped_column(String(150))
    target2: Mapped[str | None] = mapped_column(String(150))
    rei: Mapped[str | None] = mapped_column(String(50))
    buying_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    # Tank-mix dosing + pre-harvest interval for the scouting→spray loop.
    rate_per_ha: Mapped[float | None] = mapped_column(Numeric(12, 3))
    water_rate_l_per_ha: Mapped[float | None] = mapped_column(Numeric(12, 1))
    phi_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ───────────────────────────── Field capture ────────────────────────────────
class ScoutingRecord(Base):
    __tablename__ = "scouting_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Device-generated idempotency key (offline batch sync).
    client_record_id: Mapped[str | None] = mapped_column(
        PG_UUID(as_uuid=False), unique=True, index=True
    )
    # Groups all entries captured in one scouting session/submission.
    batch_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), index=True)

    greenhouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="SET NULL")
    )
    bed_id: Mapped[int | None] = mapped_column(
        ForeignKey("beds.id", ondelete="SET NULL")
    )
    bed_code: Mapped[str | None] = mapped_column(String(50))
    scout_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )

    scouting_for: Mapped[str] = mapped_column(String(20), nullable=False)
    variety_id: Mapped[int | None] = mapped_column(
        ForeignKey("varieties.id", ondelete="SET NULL")
    )
    variety_code: Mapped[str | None] = mapped_column(String(50))
    pest_id: Mapped[int | None] = mapped_column(
        ForeignKey("pests.id", ondelete="SET NULL")
    )
    disease_id: Mapped[int | None] = mapped_column(
        ForeignKey("diseases.id", ondelete="SET NULL")
    )

    lure_id: Mapped[str | None] = mapped_column(String(50))
    sticky_trap_id: Mapped[str | None] = mapped_column(String(50))
    stage: Mapped[str | None] = mapped_column(String(80))
    location_on_plant: Mapped[str | None] = mapped_column(String(80))

    severity: Mapped[int] = mapped_column(Integer, default=0)
    fcm_count: Mapped[int] = mapped_column(Integer, default=0)
    sticky_trap_bug_count: Mapped[int] = mapped_column(Integer, default=0)
    lure_bug_count: Mapped[int] = mapped_column(Integer, default=0)
    beneficials_count: Mapped[int] = mapped_column(Integer, default=0)

    notes: Mapped[str | None] = mapped_column(Text)
    # Session-level remark covering the whole submitted batch (the scout is
    # prompted once on submit). Denormalised onto every row in the batch so
    # listing/exporting a record carries its context without a join.
    session_comment: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(Text)

    gps_lat: Mapped[float | None] = mapped_column(Float)
    gps_lng: Mapped[float | None] = mapped_column(Float)
    verification_method: Mapped[str] = mapped_column(String(20), default="gps")

    # Data-quality: anomaly flag + seconds the scout spent in-block (mobile).
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(String(255))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)

    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "scouting_for IN ('disease', 'pest', 'lure', 'sticky_trap')",
            name="ck_scouting_for",
        ),
        CheckConstraint(
            "verification_method IN ('gps', 'qr_code', 'pin_bypass', 'manual')",
            name="ck_scouting_verification",
        ),
        Index("idx_scouting_lookup", "greenhouse_id", "recorded_at"),
        Index("idx_scouting_scout", "scout_id", "recorded_at"),
    )


class SprayRecord(Base):
    __tablename__ = "spray_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_record_id: Mapped[str | None] = mapped_column(
        PG_UUID(as_uuid=False), unique=True, index=True
    )
    # One spray program (a single application event) spans several products.
    program_id: Mapped[str | None] = mapped_column(PG_UUID(as_uuid=False), index=True)

    greenhouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="SET NULL")
    )
    bed_code: Mapped[str | None] = mapped_column(String(50))
    # Sub-division of a bed, as used on the FloriSynergy spray sheet.
    partition_no: Mapped[str | None] = mapped_column(String(50))
    variety_code: Mapped[str | None] = mapped_column(String(50))
    scout_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    chemical_id: Mapped[int | None] = mapped_column(
        ForeignKey("chemicals.id", ondelete="SET NULL")
    )

    product: Mapped[str | None] = mapped_column(String(150))
    type_of_application: Mapped[str | None] = mapped_column(String(100))
    rate: Mapped[str | None] = mapped_column(String(50))
    volume_of_water: Mapped[str | None] = mapped_column(String(50))
    coverage: Mapped[str | None] = mapped_column(String(50))
    who_class: Mapped[str | None] = mapped_column(String(20))
    rac_code: Mapped[str | None] = mapped_column(String(50))
    active_ingredient1: Mapped[str | None] = mapped_column(String(150))
    active_ingredient2: Mapped[str | None] = mapped_column(String(150))
    target1: Mapped[str | None] = mapped_column(String(150))
    target2: Mapped[str | None] = mapped_column(String(150))
    rei: Mapped[str | None] = mapped_column(String(50))
    qty: Mapped[float | None] = mapped_column(Numeric(12, 3))
    buying_price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    cost_of_chemical: Mapped[float | None] = mapped_column(Numeric(12, 2))

    # Loop linkage + compliance (computed when generated from a recommendation).
    recommendation_id: Mapped[int | None] = mapped_column(
        ForeignKey("recommendations.id", ondelete="SET NULL")
    )
    area_ha: Mapped[float | None] = mapped_column(Numeric(10, 4))
    phi_days: Mapped[int | None] = mapped_column(Integer)
    safe_harvest_date: Mapped[date | None] = mapped_column(Date)

    comments: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column(Time)
    # The scouting this application answers, as a window rather than a point.
    # A spray commonly answers more than one walk — a block scouted Monday and
    # Thursday and sprayed Friday — and a single date could not say so, which
    # left the link between a programme and its evidence to be guessed at.
    # `scout_report_date` is the start; the end is optional and equal to the
    # start for the ordinary single-report case.
    scout_report_date: Mapped[date | None] = mapped_column(Date)
    scout_report_end_date: Mapped[date | None] = mapped_column(Date)

    # ── Program lifecycle ────────────────────────────────────────────────
    # A program is planned before it is sprayed, and only reviewed once a
    # later round has been walked. Held on every row of the program (they
    # share a program_id) so any single record answers "did this go out?".
    program_status: Mapped[str] = mapped_column(String(20), default="planned")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    applied_by: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reviewed_by: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    # The human read on whether it worked, alongside the engine's own verdict.
    review_comment: Mapped[str | None] = mapped_column(Text)
    effectiveness: Mapped[str | None] = mapped_column(String(20))

    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        Index("idx_spray_lookup", "greenhouse_id", "recorded_at"),
        CheckConstraint(
            "program_status IN ('planned', 'applied', 'reviewed')",
            name="ck_spray_program_status",
        ),
    )


class SprayAttachment(Base):
    """A document filed against a spray program.

    The point is e-filing: the signed approval sheet comes back from the field
    as a scan or a photograph, and belongs with the program it authorises
    rather than in a drawer.
    """

    __tablename__ = "spray_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    program_id: Mapped[str] = mapped_column(
        PG_UUID(as_uuid=False), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[str | None] = mapped_column(String(40))
    note: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ───────────────────────────── Agronomy / Action ────────────────────────────
class Recommendation(Base):
    """An intervention recommendation triggered when scouting pressure exceeds
    a pest/disease threshold """

    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(primary_key=True)
    greenhouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="CASCADE")
    )
    bed_code: Mapped[str | None] = mapped_column(String(50))
    pest_id: Mapped[int | None] = mapped_column(
        ForeignKey("pests.id", ondelete="SET NULL")
    )
    disease_id: Mapped[int | None] = mapped_column(
        ForeignKey("diseases.id", ondelete="SET NULL")
    )
    recommended_chemical_id: Mapped[int | None] = mapped_column(
        ForeignKey("chemicals.id", ondelete="SET NULL")
    )

    status: Mapped[str] = mapped_column(String(20), default="open")
    trigger_severity: Mapped[int] = mapped_column(Integer, default=0)
    baseline_severity: Mapped[int | None] = mapped_column(Integer)
    post_severity: Mapped[int | None] = mapped_column(Integer)
    # Explainability: the ETL that fired this, and which scope resolved it.
    effective_threshold: Mapped[int | None] = mapped_column(Integer)
    threshold_source: Mapped[str | None] = mapped_column(String(40))
    note: Mapped[str | None] = mapped_column(Text)
    # Lifecycle: reasoned close-out + recurrence (reopen) tracking.
    outcome_note: Mapped[str | None] = mapped_column(Text)
    reopened_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'planned', 'actioned', 'resolved')",
            name="ck_rec_status",
        ),
    )


class EtlRule(Base):
    """Dynamic economic-threshold override.

    The effective threshold for a (pest|disease) is resolved by specificity:
    a rule scoped to greenhouse+variety beats variety-only beats greenhouse-only
    beats the base pest/disease threshold. Market zero-tolerance is expressed as
    a low-threshold rule scoped to the block(s) feeding that market.
    """

    __tablename__ = "etl_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    pest_id: Mapped[int | None] = mapped_column(ForeignKey("pests.id", ondelete="CASCADE"))
    disease_id: Mapped[int | None] = mapped_column(
        ForeignKey("diseases.id", ondelete="CASCADE")
    )
    variety_id: Mapped[int | None] = mapped_column(
        ForeignKey("varieties.id", ondelete="CASCADE")
    )
    greenhouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="CASCADE")
    )
    threshold: Mapped[int] = mapped_column(Integer, nullable=False)
    market: Mapped[str | None] = mapped_column(String(80))
    reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class EtlAudit(Base):
    """Governance trail for economic-threshold changes — who changed what, when,
    from which value to which, and (optionally) why. Covers both the base
    pest/disease thresholds and the scoped override rules."""

    __tablename__ = "etl_audit"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    entity: Mapped[str] = mapped_column(String(20), nullable=False)  # pest|disease|rule
    entity_id: Mapped[int | None] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    field: Mapped[str | None] = mapped_column(String(40))
    old_value: Mapped[str | None] = mapped_column(String(255))
    new_value: Mapped[str | None] = mapped_column(String(255))
    reason: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ───────────────────────────── Audit ────────────────────────────────────────
class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_log_id: Mapped[str | None] = mapped_column(
        PG_UUID(as_uuid=False), unique=True, index=True
    )
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE")
    )
    greenhouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="CASCADE")
    )
    verification_method: Mapped[str] = mapped_column(String(20), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    gps_lat: Mapped[float | None] = mapped_column(Float)
    gps_lng: Mapped[float | None] = mapped_column(Float)

    __table_args__ = (
        CheckConstraint(
            "verification_method IN ('gps', 'qr_code', 'pin_bypass', 'manual')",
            name="ck_activity_verification",
        ),
    )


class IntegrationAlias(Base):
    """A name a partner app uses, mapped to the reference row it means.

    Free-text from another system will never line up perfectly with the
    portal's tables. Rather than guessing harder in code, an unresolved name is
    recorded once here by an admin and every later submission carrying that
    text resolves instantly.
    """

    __tablename__ = "integration_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 'greenhouse' | 'pest' | 'disease' | 'variety'
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    alias: Mapped[str] = mapped_column(String(200), nullable=False)
    target_id: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(String(40), default="blooms")
    # Seen but not yet mapped: target_id 0 marks a name awaiting a decision.
    hits: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("kind", "alias", "source", name="uq_integration_alias"),
        CheckConstraint(
            "kind IN ('greenhouse', 'pest', 'disease', 'variety')",
            name="ck_integration_alias_kind",
        ),
    )


# ──────────────────────── Approval signing (e-signing) ───────────────────────
class ApprovalSlot(Base):
    """One signature line on an approval sheet, configured per farm.

    Farms differ in who has to sign off a spray: some want the agronomist, the
    manager and the storeman; some only the manager. Rather than hard-code one
    farm's paperwork, the slots are data.
    """

    __tablename__ = "approval_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    farm_id: Mapped[int | None] = mapped_column(
        ForeignKey("farms.id", ondelete="CASCADE")
    )
    # Which sheet this line appears on. A spray authorisation and a fertiliser
    # regime are signed by different people — the supplied regime carries
    # Prepared, HOD, S.A.O. and F.M., which is not the spray chain.
    document_type: Mapped[str] = mapped_column(String(40), default="spray_program")
    # What the sheet calls this line, e.g. "Approved by".
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    # A note printed under the line, e.g. "Authorises the spend and the mix".
    hint: Mapped[str | None] = mapped_column(String(200))
    position: Mapped[int] = mapped_column(Integer, default=0)
    # Null means anyone signed in may sign this line.
    required_role: Mapped[str | None] = mapped_column(String(20))
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "required_role IS NULL OR required_role IN ('scout', 'supervisor', 'admin')",
            name="ck_approval_slot_role",
        ),
    )


class Signature(Base):
    """A signature applied to a document, and the proof of what was signed.

    ``content_hash`` is the point. A signature over a document that can still
    change afterwards proves nothing, so the hash of the exact content at
    signing time is stored alongside the mark. Recomputing it later says
    whether the sheet still shows what the signer agreed to.
    """

    __tablename__ = "signatures"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 'spray_program' today; the table is deliberately not spray-specific.
    document_type: Mapped[str] = mapped_column(String(40), nullable=False)
    document_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)

    slot_id: Mapped[int | None] = mapped_column(
        ForeignKey("approval_slots.id", ondelete="SET NULL")
    )
    # Denormalised: a slot can be renamed or retired later, and the sheet must
    # still say what this person was signing as at the time.
    slot_label: Mapped[str] = mapped_column(String(80), nullable=False)

    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    signer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    signer_role: Mapped[str | None] = mapped_column(String(20))

    # The drawn mark, stored as an image under /media.
    image_url: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    signed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))

    # Voiding rather than deleting: an approval that was withdrawn is itself a
    # fact worth keeping.
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    voided_by: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    void_reason: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        Index("idx_signature_doc", "document_type", "document_id"),
    )


# ───────────────────────────── Fertigation ──────────────────────────────────
class Fertiliser(Base):
    """A salt or acid that can go into a stock tank.

    Separate from `Chemical` on purpose: a fertiliser has a nutrient analysis
    and no PHI, REI, WHO class or RAC group. Forcing both into one table would
    leave half the columns null on every row and invite a spray compliance
    check to run against a bag of magnesium sulphate.
    """

    __tablename__ = "fertilisers"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Written as the farm writes it on the sheet — CANO3, MGSO4, H2SO4.
    formula: Mapped[str | None] = mapped_column(String(60))
    unit: Mapped[str] = mapped_column(String(10), default="kg")
    price_per_unit: Mapped[float | None] = mapped_column(Float)
    # Which tank this normally belongs in. A hint for the builder, not a rule —
    # the same salt sits in different tanks on different farms.
    default_tank: Mapped[str | None] = mapped_column(String(10))
    # Acids are dosed at their own injection rate, so they are flagged rather
    # than inferred from the name.
    is_acid: Mapped[bool] = mapped_column(Boolean, default=False)
    # Vermicompost and other organic feeds. The report is explicit that their
    # rate varies with prevailing weather rather than following the regime, so
    # they must not be treated as a fixed recipe line.
    is_organic: Mapped[bool] = mapped_column(Boolean, default=False)
    # Nutrient analysis, percent by weight. Optional — a farm can run the
    # module on quantities alone and fill these in later.
    pct_n: Mapped[float | None] = mapped_column(Float)
    pct_p: Mapped[float | None] = mapped_column(Float)
    pct_k: Mapped[float | None] = mapped_column(Float)
    pct_ca: Mapped[float | None] = mapped_column(Float)
    pct_mg: Mapped[float | None] = mapped_column(Float)
    pct_s: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Fertigation(Base):
    """One fertigation, drench or flush — the sheet a farm signs and files."""

    __tablename__ = "fertigations"

    id: Mapped[int] = mapped_column(primary_key=True)
    # The id the printable document and its signatures are keyed by.
    doc_id: Mapped[str] = mapped_column(
        PG_UUID(as_uuid=False), unique=True, index=True, nullable=False
    )
    reference: Mapped[str | None] = mapped_column(String(40))

    activity: Mapped[str] = mapped_column(String(20), default="fertigation")
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    effective_from: Mapped[date | None] = mapped_column(Date)
    start_time: Mapped[str | None] = mapped_column(String(10))

    phase_id: Mapped[int | None] = mapped_column(
        ForeignKey("phases.id", ondelete="SET NULL")
    )
    # The phase name as it stood, so a renamed phase cannot restate a signed
    # sheet. Also carries a free-text label where no phase is on file.
    phase: Mapped[str | None] = mapped_column(String(60))

    type_of_application: Mapped[str | None] = mapped_column(String(60))

    # ── The one number keyed in, and everything derived from it ──────────
    # Litres of solution made up — what the report calls sets. "1 set = 1,000
    # litres; 6 sets = 6,000 litres." This is the input; the water is not.
    solution_l: Mapped[float | None] = mapped_column(Float)
    area_ha: Mapped[float | None] = mapped_column(Float)

    # Derived and stored so a signed sheet keeps its figures if a block is
    # re-measured later. water = litres ÷ pump rate; the rest follows.
    #   L/ha    = litres ÷ area
    #   m³/ha   = (L/ha) ÷ pump rate
    #   m³ used = m³/ha × area
    volume_m3: Mapped[float | None] = mapped_column(Float)
    l_per_ha: Mapped[float | None] = mapped_column(Float)
    # The figure the report illustrates as 33.33. An outcome, never a target.
    target_m3_per_ha: Mapped[float | None] = mapped_column(Float)
    # Vermicompost rate varies with the weather, per the source report, so the
    # conditions are part of the record rather than a note.
    weather: Mapped[str | None] = mapped_column(String(80))

    # The sarai valve rates: litres of solution and of acid injected per m³ of
    # irrigation water. "Machine Pump Rate = 6 litres/m³ (this is fixed)" —
    # fixed, but held on the record rather than read from config at display
    # time, so a change next season cannot rewrite what this sheet said.
    #
    # The pump rate is also the conversion between the two units on the sheet:
    # water m³ = litres ÷ this. It is not 1,000.
    fertiliser_rate_l_m3: Mapped[float] = mapped_column(Float, default=6.0)
    acid_rate_l_m3: Mapped[float] = mapped_column(Float, default=2.0)

    applicator_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    prepared_by: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL")
    )
    comments: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    blocks: Mapped[list["FertigationBlock"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    tanks: Mapped[list["FertigationTank"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="FertigationTank.code"
    )
    sources: Mapped[list["FertigationSource"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (
        CheckConstraint(
            "activity IN ('fertigation', 'drenching', 'flushing')",
            name="ck_fertigation_activity",
        ),
        CheckConstraint(
            "status IN ('draft', 'issued', 'completed', 'cancelled')",
            name="ck_fertigation_status",
        ),
        Index("idx_fertigation_lookup", "event_date", "phase_id"),
    )


class FertigationBlock(Base):
    """One greenhouse on a fertigation, with the area it counted for.

    The area is snapshotted rather than read live: the supplied records already
    disagree about total farm area — 30 ha in the report, 32 ha in the daily
    summary — and a sheet has to keep reporting the m³/ha it was signed with.
    """

    __tablename__ = "fertigation_blocks"

    id: Mapped[int] = mapped_column(primary_key=True)
    fertigation_id: Mapped[int] = mapped_column(
        ForeignKey("fertigations.id", ondelete="CASCADE"), index=True
    )
    greenhouse_id: Mapped[int | None] = mapped_column(
        ForeignKey("greenhouses.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50))
    area_ha: Mapped[float | None] = mapped_column(Float)
    # Delivered to this block, where the farm meters per greenhouse. Optional —
    # many record only the phase total.
    volume_m3: Mapped[float | None] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint(
            "fertigation_id", "greenhouse_id", name="uq_fertigation_block"
        ),
    )


class FertigationTank(Base):
    """A stock tank — A, B, C — its volume, and how many sets were made up.

    Tanks are rows rather than columns because their number and naming differ
    by farm, and a two-tank site should not carry an empty Tank C.
    """

    __tablename__ = "fertigation_tanks"

    id: Mapped[int] = mapped_column(primary_key=True)
    fertigation_id: Mapped[int] = mapped_column(
        ForeignKey("fertigations.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    volume_l: Mapped[float] = mapped_column(Float, default=1000.0)
    # 'auto'  — derived from the water volume and the injection rate
    # 'manual' — the operator confirmed a different approved count
    sets_mode: Mapped[str] = mapped_column(String(10), default="auto")
    sets: Mapped[float] = mapped_column(Float, default=1.0)
    note: Mapped[str | None] = mapped_column(String(200))

    lines: Mapped[list["FertigationLine"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by="FertigationLine.position"
    )


class FertigationLine(Base):
    """One fertiliser in one tank, at the quantity written on the sheet."""

    __tablename__ = "fertigation_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    tank_id: Mapped[int] = mapped_column(
        ForeignKey("fertigation_tanks.id", ondelete="CASCADE"), index=True
    )
    fertiliser_id: Mapped[int | None] = mapped_column(
        ForeignKey("fertilisers.id", ondelete="SET NULL")
    )
    # Denormalised so a renamed or retired fertiliser cannot change what a
    # signed sheet says was put in the tank.
    fertiliser_code: Mapped[str] = mapped_column(String(40), nullable=False)
    fertiliser_name: Mapped[str | None] = mapped_column(String(150))
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    unit: Mapped[str] = mapped_column(String(10), default="kg")
    # Denormalised from the register: which injection rate this tank is dosed
    # at must not depend on what the tank happens to be called.
    is_acid: Mapped[bool] = mapped_column(Boolean, default=False)
    unit_price: Mapped[float | None] = mapped_column(Float)
    cost: Mapped[float | None] = mapped_column(Float)
    position: Mapped[int] = mapped_column(Integer, default=0)


class FertigationSource(Base):
    """Where the water came from, and what it read.

    EC and pH belong to the source, not the event: borehole and river water
    differ, and averaging them into one figure loses the reason the acid dose
    changed.
    """

    __tablename__ = "fertigation_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    fertigation_id: Mapped[int] = mapped_column(
        ForeignKey("fertigations.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[str] = mapped_column(String(30), nullable=False)
    volume_m3: Mapped[float | None] = mapped_column(Float)
    ec: Mapped[float | None] = mapped_column(Float)
    ph: Mapped[float | None] = mapped_column(Float)
    note: Mapped[str | None] = mapped_column(String(200))
