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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Disease(Base):
    __tablename__ = "diseases"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    threshold: Mapped[int] = mapped_column(Integer, default=3)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


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
    scout_report_date: Mapped[date | None] = mapped_column(Date)

    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (Index("idx_spray_lookup", "greenhouse_id", "recorded_at"),)


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
