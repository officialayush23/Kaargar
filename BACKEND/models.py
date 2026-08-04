"""
Kaargar — All SQLAlchemy models.
Maps directly to Supabase PostgreSQL tables.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    String, Text, Boolean, Integer, BigInteger, DateTime, Numeric,
    ForeignKey, Index, CheckConstraint, UniqueConstraint, JSON, ARRAY,
    Computed, func, Date, Time, SmallInteger,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from database import Base


# ── helpers ──────────────────────────────────────────────────
def uuid_pk():
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def now():
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── 1. USERS ─────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    phone: Mapped[str | None] = mapped_column(String(15))
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    full_name: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    ban_reason: Mapped[str | None] = mapped_column(Text)
    referral_code: Mapped[str | None] = mapped_column(String(12), unique=True)
    referred_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    worker_profile = relationship("WorkerProfile", back_populates="user", uselist=False)
    addresses      = relationship("UserAddress", back_populates="user", cascade="all, delete-orphan")


# ── 2. OTP SESSIONS ──────────────────────────────────────────
class OTPSession(Base):
    __tablename__ = "otp_sessions"

    id: Mapped[uuid.UUID] = uuid_pk()
    identifier: Mapped[str] = mapped_column(String(254), nullable=False)
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = now()
    # Which channel this OTP was/would be sent over ('email' | 'sms'). Added
    # by the otp_channel_and_sms_flag migration alongside
    # platform_config.sms_otp_enabled, ahead of the OTP send/verify routes
    # that will actually populate it — nullable until those routes exist.
    channel: Mapped[str | None] = mapped_column(String(10))


# ── 3. CATEGORIES ─────────────────────────────────────────────
class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon_name: Mapped[str | None] = mapped_column(String(50))
    icon_emoji: Mapped[str | None] = mapped_column(String(10))
    color_hex: Mapped[str | None] = mapped_column(String(7))
    mode: Mapped[str] = mapped_column(String(20), default="both")
    # Section 9(5) CGST Act: for the platform-liable categories (plumbing, electrical,
    # cleaning, carpentry, painting, appliance-repair, pest-control) Kaargar itself is
    # liable for GST on the full service value, not just its commission. Everything
    # else defaults to commission_only (GST charged on the platform's commission fee).
    gst_treatment: Mapped[str] = mapped_column(String(30), default="commission_only")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    min_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=50)
    icon_url: Mapped[str | None] = mapped_column(Text)   # custom PNG/SVG/Lottie icon URL (Supabase Storage)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


# ── 4. TAGS ───────────────────────────────────────────────────
class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()


# ── 5. WORKER PROFILES ───────────────────────────────────────
class WorkerProfile(Base):
    __tablename__ = "worker_profiles"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    bio: Mapped[str | None] = mapped_column(Text)
    experience_years: Mapped[int | None] = mapped_column(Integer, default=0)
    pune_area: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="offline")
    verification_status: Mapped[str] = mapped_column(String(20), default="pending")
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_instant_available: Mapped[bool] = mapped_column(Boolean, default=False)
    is_discovery_available: Mapped[bool] = mapped_column(Boolean, default=True)
    service_radius_km: Mapped[int] = mapped_column(Integer, default=5)
    avg_rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    total_jobs_completed: Mapped[int] = mapped_column(Integer, default=0)
    total_jobs_accepted: Mapped[int] = mapped_column(Integer, default=0)
    total_jobs_requested: Mapped[int] = mapped_column(Integer, default=0)
    acceptance_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=1.0)
    completion_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=1.0)
    avg_response_time_sec: Mapped[int] = mapped_column(Integer, default=0)
    cancellation_score: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=1.0)
    # Standing offset subtracted from the raw review average every time
    # avg_rating is recomputed (see services/penalties.recompute_worker_rating).
    # Exists so a no-show rating penalty persists instead of being silently
    # wiped the next time a real review comes in and avg_rating is recomputed
    # from scratch off the reviews table.
    rating_penalty_total: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=0)
    consecutive_rejects: Mapped[int] = mapped_column(Integer, default=0)
    auto_offline_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    pending_payout: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    payout_upi_id: Mapped[str | None] = mapped_column(String(100))
    payout_bank_account: Mapped[str | None] = mapped_column(String(20))
    payout_ifsc: Mapped[str | None] = mapped_column(String(11))
    payout_account_name: Mapped[str | None] = mapped_column(String(100))
    payout_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()
    min_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    max_rate: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Discovery-mode: worker opts in to letting a customer book them across
    # multiple days for the same service in one go.
    allow_multi_day_booking: Mapped[bool] = mapped_column(Boolean, default=False)

    user = relationship("User", back_populates="worker_profile")
    services = relationship("Service", back_populates="worker")
    location = relationship("WorkerLocation", back_populates="worker", uselist=False)


# ── 6. WORKER DOCUMENTS ──────────────────────────────────────
class WorkerDocument(Base):
    __tablename__ = "worker_documents"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    cloudinary_url: Mapped[str] = mapped_column(Text, nullable=False)
    cloudinary_id: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_kb: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()


# ── 7. WORKER CATEGORIES (M2M) ───────────────────────────────
class WorkerCategory(Base):
    __tablename__ = "worker_categories"

    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), primary_key=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()


# ── 8. SERVICES ───────────────────────────────────────────────
class Service(Base):
    __tablename__ = "services"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    price_type: Mapped[str] = mapped_column(String(20), default="fixed")
    duration_min: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    total_bookings: Mapped[int] = mapped_column(Integer, default=0)
    avg_rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    service_mode: Mapped[str] = mapped_column(String(10), default="both")
    visit_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # ── Slot-based scheduling (migration 007) ─────────────────────
    # requires_slot=True  → strict slot booking (salon, doctor-style)
    # requires_slot=False → flexible window assignment (plumber, electrician)
    requires_slot: Mapped[bool] = mapped_column(Boolean, default=False)
    slot_duration_min: Mapped[int | None] = mapped_column(Integer)     # minutes per slot
    max_slots_per_day: Mapped[int | None] = mapped_column(Integer)     # daily cap
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))  # alias for price

    # Discovery-mode: this specific service can be booked across multiple
    # days in one go (e.g. a recurring weekly cleaning service). Distinct
    # from WorkerProfile.allow_multi_day_booking, which is the worker's
    # overall opt-in — a booking only offers the multi-day option when BOTH
    # the worker and the specific service allow it.
    allow_multi_day_booking: Mapped[bool] = mapped_column(Boolean, default=False)

    # Links this worker's listing to the admin-curated catalog entry
    # (migration 013). NULL means this is a free-text listing — still valid
    # for Discover, but never surfaced in the curated Instant-mode browsing
    # list. See ServiceCatalog above.
    catalog_service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_catalog.id", ondelete="SET NULL"))

    worker = relationship("WorkerProfile", back_populates="services")
    category = relationship("Category")
    slot_config = relationship("ServiceSlotConfig", back_populates="service", uselist=False)


# ── 8.5 SERVICE CATALOG (admin-curated, migration 013) ────────
# The atomic bookable unit for Instant mode. A `Service` row (above) is a
# specific worker's listing; `ServiceCatalog` is the platform-wide, curated
# name that many workers' Service rows can point to via
# Service.catalog_service_id. Instant-mode customer browsing/dispatch is
# driven by this table, not raw category — see SYSTEM_OVERVIEW.md §11 and
# services/matching.py. Discover stays free-text/uncontrolled by design.
class ServiceCatalog(Base):
    __tablename__ = "service_catalog"

    id: Mapped[uuid.UUID] = uuid_pk()
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    icon_url: Mapped[str | None] = mapped_column(Text)
    # Optional per-service price floor/reference (migration 014). Falls back
    # to the parent Category.min_price when unset — see routers/workers.py's
    # price-floor validation and routers/categories.py's customer-facing
    # display fallback.
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # approved | pending | rejected — see migration 013 for the full semantics.
    status: Mapped[str] = mapped_column(String(20), default="approved")
    submitted_by_worker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("worker_profiles.id", ondelete="SET NULL"))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Aggregate "times availed" across ALL workers offering this catalog
    # service — incremented on job completion (see routers/jobs.py
    # _finalize_job_completion). Distinct from Service.total_bookings, which
    # is per-worker.
    total_bookings: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    category = relationship("Category")


# ── 9. SERVICE TAGS ───────────────────────────────────────────
class ServiceTag(Base):
    __tablename__ = "service_tags"

    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)


# ── 10. SERVICE MEDIA ─────────────────────────────────────────
class ServiceMedia(Base):
    __tablename__ = "service_media"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id", ondelete="SET NULL"))
    type: Mapped[str] = mapped_column(String(10), nullable=False)
    cloudinary_url: Mapped[str] = mapped_column(Text, nullable=False)
    cloudinary_id: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    caption: Mapped[str | None] = mapped_column(Text)
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    file_size_mb: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()


# ── 11. PACKAGES ──────────────────────────────────────────────
class Package(Base):
    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    original_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discounted_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    redemption_type: Mapped[str] = mapped_column(String(30), default="multi_use")
    validity_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    total_bookings: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    items = relationship("PackageService", back_populates="package", cascade="all, delete-orphan")


class PackageService(Base):
    __tablename__ = "package_services"

    package_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("packages.id", ondelete="CASCADE"), primary_key=True)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id", ondelete="CASCADE"), primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    redeem_type: Mapped[str] = mapped_column(String(15), default="repeatable")

    package = relationship("Package", back_populates="items")
    service = relationship("Service")


# ── 12. OFFERS ────────────────────────────────────────────────
class Offer(Base):
    __tablename__ = "offers"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id"))
    package_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("packages.id"))
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    discount_type: Mapped[str] = mapped_column(String(20), nullable=False)
    discount_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    min_order_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    promo_code: Mapped[str | None] = mapped_column(String(30), unique=True)
    valid_from: Mapped[datetime] = now()
    valid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    usage_limit: Mapped[int | None] = mapped_column(Integer)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now()


# ── 13. WORKER LOCATIONS ─────────────────────────────────────
class WorkerLocation(Base):
    __tablename__ = "worker_locations"

    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="CASCADE"), primary_key=True)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    lon: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    accuracy_m: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    heading: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    geom = mapped_column(Geography("POINT", srid=4326), nullable=False)
    updated_at: Mapped[datetime] = now()

    worker = relationship("WorkerProfile", back_populates="location")


# ── 14. LOCATION HISTORY ─────────────────────────────────────
class LocationHistory(Base):
    __tablename__ = "location_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id"), nullable=False)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id"))
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    lon: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    geom = mapped_column(Geography("POINT", srid=4326), nullable=False)
    recorded_at: Mapped[datetime] = now()


# ── 15. JOBS ──────────────────────────────────────────────────
class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    worker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("worker_profiles.id"))
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id"))
    package_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("packages.id"))
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id"), nullable=False)
    # Instant-mode only: the curated catalog service the customer picked
    # (profession -> service selection). service_id above means something
    # different — a specific worker's pinned Service row for Discovery.
    # NULL here means this job predates the catalog (or was created without
    # picking a specific service) — matching.py falls back to category-only.
    catalog_service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_catalog.id", ondelete="SET NULL"))
    offer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("offers.id"))
    job_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="requested")
    title: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    location_lat: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    location_lon: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    location_address: Mapped[str] = mapped_column(Text, nullable=False)
    location_area: Mapped[str | None] = mapped_column(String(100))
    location_geom = mapped_column(Geography("POINT", srid=4326), nullable=False)
    location_note: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quoted_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    final_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    commission_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    platform_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    gst_on_fee: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    worker_payout: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    search_radius_km: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    workers_notified: Mapped[int] = mapped_column(Integer, default=0)
    dispatch_rounds: Mapped[int] = mapped_column(Integer, default=0)
    job_photos = mapped_column(ARRAY(Text))
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    en_route_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancellation_reason: Mapped[str | None] = mapped_column(Text)
    cancelled_by: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()
    budget_max: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # ── Slot reference (migration 007) ───────────────────────
    slot_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("service_slots.id", ondelete="SET NULL"))

    # ── Scheduling fields (migration 006) ─────────────────────
    # source distinguishes how the job was created:
    #   'instant'   — real-time Uber-style dispatch
    #   'scheduled' — user picked preferred days + time window
    #   'package'   — booked via a purchased package
    source: Mapped[str] = mapped_column(String(20), default="instant")
    is_flexible: Mapped[bool] = mapped_column(Boolean, default=False)
    # preferred_days: JSON array of ISO date strings, max 3
    # e.g. ["2025-06-10", "2025-06-11", "2025-06-12"]
    preferred_days = mapped_column(JSONB)
    window_start = mapped_column(Time)   # e.g. 16:00
    window_end   = mapped_column(Time)   # e.g. 18:00
    assigned_date = mapped_column(Date)  # which preferred_day was used

    # ── Job completion flow (migration 010) ───────────────────
    # before_photos/after_photos store paths within the `job_before_after` bucket.
    before_photos = mapped_column(ARRAY(Text))
    after_photos  = mapped_column(ARRAY(Text))
    extra_items_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    # approved_total = base final_price + extra_items_total, locked at customer approval.
    # This is the ONLY amount payments.create_order may charge once set.
    approved_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_for_approval_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Completion OTP — separate from Supabase Auth OTP. Generated on customer approval,
    # shown only to the customer, entered by the worker to trigger payment.
    completion_otp_code: Mapped[str | None] = mapped_column(String(6))
    completion_otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completion_otp_attempts: Mapped[int] = mapped_column(Integer, default=0)
    completion_otp_locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # ── No-show tracking (migration 012) ───────────────────────
    # no_show_status: 'reported' (customer reported, inconclusive/contested —
    # sent to support) | 'confirmed' (GPS clearly showed worker nowhere near)
    # | 'rejected' (admin manually rejected a report). No enum constraint —
    # plain varchar, values enforced in application code.
    no_show_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    no_show_status: Mapped[str | None] = mapped_column(String(20))

    # ── Multi-day booking bundle (migration 013) ──────────────
    # A multi-day booking (e.g. a 39-day security-guard booking) is created as
    # N Job rows in ONE transaction instead of N unrelated bookings. The first
    # day is the "parent" (parent_job_id=NULL, day_index=1); every subsequent
    # day points back at the parent via parent_job_id. total_days is
    # denormalized onto every row in the bundle (parent + children alike) so
    # any single row can tell you the size of the bundle it belongs to.
    # ON DELETE CASCADE: deleting the parent job deletes every day under it.
    parent_job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"))
    day_index: Mapped[int | None] = mapped_column(Integer)
    total_days: Mapped[int | None] = mapped_column(Integer)

    user = relationship("User")
    worker = relationship("WorkerProfile")
    category = relationship("Category")
    service = relationship("Service")
    item_receipts = relationship("JobItemReceipt", back_populates="job", cascade="all, delete-orphan")


# ── 15b. JOB ITEM RECEIPTS (migration 010) ────────────────────
# Connects a job to each worker-added extra item: its cost, a photo of the item
# itself, and a photo of the purchase receipt/bill. Paths point into the
# `job_item_photos` Supabase Storage bucket. is_approved flips true (denormalized,
# not re-derived via join) the moment the customer approves the whole job bill.
class JobItemReceipt(Base):
    __tablename__ = "job_item_receipts"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("worker_profiles.id"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    item_photo_path: Mapped[str] = mapped_column(Text, nullable=False)
    receipt_photo_path: Mapped[str] = mapped_column(Text, nullable=False)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()

    job = relationship("Job", back_populates="item_receipts")


# ── 16. JOB WORKER REQUESTS ──────────────────────────────────
class JobWorkerRequest(Base):
    __tablename__ = "job_worker_requests"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    radius_km: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    distance_km: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    score_at_dispatch: Mapped[Decimal | None] = mapped_column(Numeric(6, 4))
    notified_at: Mapped[datetime] = now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = now()


# ── 17. JOB EVENTS ───────────────────────────────────────────
class JobEvent(Base):
    __tablename__ = "job_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    actor: Mapped[str] = mapped_column(String(20), nullable=False)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    lon: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default={})
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now()


# ── 18. REVIEWS ───────────────────────────────────────────────
class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), unique=True, nullable=False)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id"), nullable=False)
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id"))
    rating: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    quality_rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    punctuality_rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    communication_rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    value_rating: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    text: Mapped[str | None] = mapped_column(Text)
    photos = mapped_column(ARRAY(Text))
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[str | None] = mapped_column(Text)
    reply: Mapped[str | None] = mapped_column(Text)
    reply_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()


# ── 19. PAYMENTS ──────────────────────────────────────────────
class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    payment_method: Mapped[str | None] = mapped_column(String(20))
    razorpay_order_id: Mapped[str | None] = mapped_column(String(60), unique=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(60), unique=True)
    razorpay_signature: Mapped[str | None] = mapped_column(Text)
    held_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escrow_release_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escrow_released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refund_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    refund_reason: Mapped[str | None] = mapped_column(Text)
    last_webhook_event: Mapped[str | None] = mapped_column(String(50))
    last_webhook_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()


# ── 20. PAYOUTS ───────────────────────────────────────────────
class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id"), nullable=False)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"), nullable=False)
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    gross_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    gst_on_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    tds_deducted: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    net_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    razorpay_transfer_id: Mapped[str | None] = mapped_column(String(60))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failure_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()


# ── 21. CHATS ─────────────────────────────────────────────────
class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now()
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── 22. MESSAGES ──────────────────────────────────────────────
class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    chat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("chats.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    sender_role: Mapped[str] = mapped_column(String(10), nullable=False)
    type: Mapped[str] = mapped_column(String(10), default="text")
    raw_content: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    media_url: Mapped[str | None] = mapped_column(Text)
    system_event: Mapped[str | None] = mapped_column(String(50))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()


# ── 23. NOTIFICATIONS ─────────────────────────────────────────
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, default={})
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    email_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()
    # FCM push delivery tracking — added by fcm_device_tokens_and_notification_columns.
    # Populated once services/notifications.py actually sends pushes (see
    # DeviceToken below); until then these just sit at their defaults.
    push_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    push_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    push_error: Mapped[str | None] = mapped_column(Text)
    fcm_message_id: Mapped[str | None] = mapped_column(Text)


# ── 24. SUPPORT TICKETS ──────────────────────────────────────
class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    worker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("worker_profiles.id"))
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open")
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    resolution: Mapped[str | None] = mapped_column(Text)
    refund_amount: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    refund_status: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[uuid.UUID] = uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    sender_role: Mapped[str] = mapped_column(String(10), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    attachments = mapped_column(ARRAY(Text))
    created_at: Mapped[datetime] = now()


# ── 25. SOS EVENTS ────────────────────────────────────────────
class SOSEvent(Base):
    __tablename__ = "sos_events"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    triggered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    triggered_by_role: Mapped[str] = mapped_column(String(10), nullable=False)
    lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    lon: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    status: Mapped[str] = mapped_column(String(20), default="active")
    notes: Mapped[str | None] = mapped_column(Text)
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()


# ── 26. CANCELLATION PENALTIES ────────────────────────────────
class CancellationPenalty(Base):
    __tablename__ = "cancellation_penalties"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    charged_to: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    charged_role: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    waived_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    waived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()


# ── 27. SEARCH HISTORY ────────────────────────────────────────
class SearchHistory(Base):
    __tablename__ = "search_history"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    detected_mode: Mapped[str | None] = mapped_column(String(20))
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    result_clicked_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    result_type: Mapped[str | None] = mapped_column(String(20))
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = now()


# ── 28. USER PREFERENCES ─────────────────────────────────────
class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    top_categories: Mapped[dict] = mapped_column(JSONB, default=[])
    top_tags: Mapped[dict] = mapped_column(JSONB, default=[])
    preferred_mode: Mapped[str | None] = mapped_column(String(20), default="instant")
    home_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 8))
    home_lon: Mapped[Decimal | None] = mapped_column(Numeric(11, 8))
    home_address: Mapped[str | None] = mapped_column(Text)
    pune_area: Mapped[str | None] = mapped_column(String(100))
    updated_at: Mapped[datetime] = now()


# ── 29. WORKER ANALYTICS ─────────────────────────────────────
class WorkerAnalytics(Base):
    __tablename__ = "worker_analytics"

    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id"), primary_key=True)
    total_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    total_jobs: Mapped[int] = mapped_column(Integer, default=0)
    month_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    month_jobs: Mapped[int] = mapped_column(Integer, default=0)
    week_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    week_jobs: Mapped[int] = mapped_column(Integer, default=0)
    today_earnings: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0)
    today_jobs: Mapped[int] = mapped_column(Integer, default=0)
    avg_job_value: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0)
    avg_rating_30d: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=0)
    cancellation_count_30d: Mapped[int] = mapped_column(Integer, default=0)
    top_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    updated_at: Mapped[datetime] = now()


# ── 30. PLATFORM CONFIG ──────────────────────────────────────
class PlatformConfig(Base):
    __tablename__ = "platform_config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = now()
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


# ── 31. PUNE AREAS ────────────────────────────────────────────
class PuneArea(Base):
    __tablename__ = "pune_areas"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    lat: Mapped[Decimal] = mapped_column(Numeric(10, 8), nullable=False)
    lon: Mapped[Decimal] = mapped_column(Numeric(11, 8), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ── 31b. WORKER SERVICE AREAS (migration 017) ──────────────────
# A worker's chosen set of named Pune areas — Instant dispatch is filtered
# strictly to this list (see services/matching.py::_resolve_area_id). A
# worker with no rows here gets no Instant jobs until they pick at least one.
# Distinct from WorkerProfile.pune_area (a single free-text display field);
# this is the structured, multi-valued list actually used for matching.
class WorkerArea(Base):
    __tablename__ = "worker_areas"

    worker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), primary_key=True
    )
    area_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("pune_areas.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = now()


# ── 32. REFRESH TOKENS ─────────────────────────────────────────
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    token: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()


# ── 33. PACKAGE ORDERS ────────────────────────────────────────
class PackageOrder(Base):
    __tablename__ = "package_orders"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    package_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("packages.id", ondelete="RESTRICT"), nullable=False)
    worker_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("worker_profiles.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active")
    total_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purchased_at: Mapped[datetime] = now()
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()

    user = relationship("User")
    package = relationship("Package")
    worker = relationship("WorkerProfile")
    usages = relationship("PackageUsage", back_populates="order")


# ── 34. PACKAGE USAGES ────────────────────────────────────────
class PackageUsage(Base):
    __tablename__ = "package_usages"

    id: Mapped[uuid.UUID] = uuid_pk()
    package_order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("package_orders.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("services.id", ondelete="RESTRICT"), nullable=False)
    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    used_at: Mapped[datetime] = now()

    order = relationship("PackageOrder", back_populates="usages")
    service = relationship("Service")


# ── 35. WORKER AVAILABILITY — recurring weekly schedule ───────
class WorkerAvailability(Base):
    """
    Defines a worker's recurring weekly working hours.
    One row per (worker, day_of_week).
    day_of_week: 0=Monday … 6=Sunday
    Workers that never set this get seeded defaults (9 AM–9 PM, all days).
    """
    __tablename__ = "worker_availability"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger, nullable=False)  # 0–6
    start_time = mapped_column(Time, nullable=False)
    end_time   = mapped_column(Time, nullable=False)
    is_open: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    __table_args__ = (
        UniqueConstraint("worker_id", "day_of_week", name="wa_unique_day"),
        CheckConstraint("end_time > start_time", name="wa_time_order"),
        CheckConstraint("day_of_week BETWEEN 0 AND 6", name="wa_day_range"),
    )

    worker = relationship("WorkerProfile")


# ── 36. WORKER TIME OFF — temporary unavailability ────────────
class WorkerTimeOff(Base):
    """
    A date-time range during which the worker is unavailable.
    Checked during scheduled-job assignment to skip this worker.
    """
    __tablename__ = "worker_time_off"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False
    )
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_datetime:   Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now()

    __table_args__ = (
        CheckConstraint("end_datetime > start_datetime", name="wto_time_order"),
    )

    worker = relationship("WorkerProfile")


# ── 37. WORKER SCHEDULE BLOCKS — reserved time windows ────────
# ── 37. WORKER SCHEDULE BLOCKS — reserved time windows ────────
class WorkerScheduleBlock(Base):
    """
    A concrete time window reserved for a scheduled job on a specific date.
    Created when a worker is assigned to a scheduled job.
    Used to detect conflicts before assigning another job.

    Invariant per worker: no two blocks on the same date may have
    overlapping (window_start, window_end) ranges.
    Enforced in application logic (check_worker_availability).
    """
    __tablename__ = "worker_schedule_blocks"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("jobs.id", ondelete="SET NULL")
    )
    date = mapped_column(Date, nullable=False)
    window_start = mapped_column(Time, nullable=False)
    window_end   = mapped_column(Time, nullable=False)
    created_at: Mapped[datetime] = now()

    __table_args__ = (
        CheckConstraint("window_end > window_start", name="wsb_time_order"),
    )

    worker = relationship("WorkerProfile")
    job    = relationship("Job")


# ── 38. SERVICE SLOT CONFIG — per-service slot settings ───────
class ServiceSlotConfig(Base):
    """
    Defines how slots are generated for a slot-based service.
    One row per service (unique constraint on service_id).
    """
    __tablename__ = "service_slot_config"

    id: Mapped[uuid.UUID] = uuid_pk()
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False
    )
    slot_duration_min: Mapped[int] = mapped_column(Integer, default=60)
    buffer_min: Mapped[int] = mapped_column(Integer, default=15)
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    max_slots_per_day: Mapped[int] = mapped_column(Integer, default=8)
    auto_generate: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    service = relationship("Service", back_populates="slot_config")
    worker  = relationship("WorkerProfile")


# ── 39. SERVICE SLOTS — bookable time slots ───────────────────
class ServiceSlot(Base):
    """
    A concrete bookable slot for a slot-based service on a specific date.
    booked_count is updated by a DB trigger (trg_slot_booking) when jobs
    are created or cancelled.
    """
    __tablename__ = "service_slots"

    id: Mapped[uuid.UUID] = uuid_pk()
    service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("services.id", ondelete="CASCADE"), nullable=False
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("worker_profiles.id", ondelete="CASCADE"), nullable=False
    )
    slot_date  = mapped_column(Date, nullable=False)
    slot_start = mapped_column(Time, nullable=False)
    slot_end   = mapped_column(Time, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    booked_count: Mapped[int] = mapped_column(Integer, default=0)
    is_blocked: Mapped[bool] = mapped_column(Boolean, default=False)
    block_reason: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = now()

    __table_args__ = (
        UniqueConstraint("worker_id", "service_id", "slot_date", "slot_start", name="uq_slot"),
        CheckConstraint("slot_end > slot_start", name="chk_slot_times"),
        CheckConstraint("booked_count >= 0 AND booked_count <= capacity", name="chk_booked_count"),
    )

    service = relationship("Service")
    worker  = relationship("WorkerProfile")


class UserAddress(Base):
    """User saved address — labelled locations for quick reuse at booking."""
    __tablename__ = "user_addresses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(50), nullable=False)       # "Home", "Work"
    address_line: Mapped[str] = mapped_column(Text, nullable=False)
    # Free-text unit-level detail (flat/plot/house no., floor, landmark) the
    # geocoder can't know — kept separate from address_line so re-geocoding
    # or re-picking the pin never clobbers it (migration 016).
    details: Mapped[str | None] = mapped_column(Text)
    area: Mapped[str | None] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(100), default="Pune")
    lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    lon: Mapped[float | None] = mapped_column(Numeric(9, 6))
    place_id: Mapped[str | None] = mapped_column(String(255))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    user = relationship("User", back_populates="addresses")


# ── 40. DEVICE TOKENS — FCM push registration ─────────────────
# Added by fcm_device_tokens_and_notification_columns (live DB migration,
# applied directly via SQL — this model was missing until now). One row per
# device a user has logged in on; is_active flips false on an FCM
# "unregistered" error instead of deleting the row so
# promo_campaign_deliveries.device_token_id stays valid for history.
class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    fcm_token: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(10), nullable=False)  # 'ios' | 'android'
    device_id: Mapped[str | None] = mapped_column(String(255))
    app_version: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[datetime] = now()
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    user = relationship("User")


# ── 41. PROMO CAMPAIGNS — admin-authored push broadcasts ──────
# Added by promo_campaigns_and_deliveries (live DB migration, applied
# directly via SQL — this model was missing until now).
class PromoCampaign(Base):
    __tablename__ = "promo_campaigns"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(255), nullable=False)          # internal/admin-facing name
    message_title: Mapped[str] = mapped_column(String(255), nullable=False)  # push notification title
    message_body: Mapped[str] = mapped_column(Text, nullable=False)
    deep_link: Mapped[str | None] = mapped_column(Text)
    discount_type: Mapped[str | None] = mapped_column(String(20))
    discount_value: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    promo_code: Mapped[str | None] = mapped_column(String(50))
    target_city: Mapped[str | None] = mapped_column(String(100))
    target_category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    # Additional audience targeting rules not covered by the two columns
    # above (e.g. role, last-active window) — shape owned by the delivery
    # logic that builds the recipient list, not enforced at the DB layer.
    audience_filter: Mapped[dict] = mapped_column(JSONB, default={})
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft | scheduled | sending | sent | failed
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    audience_count: Mapped[int | None] = mapped_column(Integer)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()

    target_category = relationship("Category")
    deliveries = relationship("PromoCampaignDelivery", back_populates="campaign", cascade="all, delete-orphan")


# ── 42. PROMO CAMPAIGN DELIVERIES — per-recipient send record ─
class PromoCampaignDelivery(Base):
    __tablename__ = "promo_campaign_deliveries"

    id: Mapped[uuid.UUID] = uuid_pk()
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("promo_campaigns.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_token_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("device_tokens.id"))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | sent | failed
    fcm_message_id: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = now()

    campaign = relationship("PromoCampaign", back_populates="deliveries")
    user = relationship("User")
    device_token = relationship("DeviceToken")


# ── 43. CONTENT TRANSLATIONS — Sarvam translation cache ───────
# Backs services/translation.py, which already reads/writes this table
# directly via sqlalchemy.text() (raw SQL) since no model existed for it.
# Added here per CLAUDE.md rule #2 ("all SQLAlchemy models live in
# models.py — no exceptions") — translation.py itself doesn't need to
# change; this just gives the table a proper model for anything else that
# wants to query it through the ORM.
class ContentTranslation(Base):
    __tablename__ = "content_translations"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "language", "field", name="content_translations_entity_type_entity_id_language_field_key"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # 'service' | 'package' | 'offer' | 'review'
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    language: Mapped[str] = mapped_column(String(5), nullable=False)     # 'en' | 'hi' | 'mr'
    field: Mapped[str] = mapped_column(String(50), nullable=False)       # e.g. 'title', 'description'
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()


# ── 44. INSTANT CANCELLATIONS (pre-assignment) ────────────────
class InstantCancellation(Base):
    """
    A customer cancelling an Instant job BEFORE a worker was assigned.

    No penalty attaches — nobody has been inconvenienced yet, so charging for
    it would be indefensible. This exists purely as product signal: right now
    `cancel_job` takes a free-text reason and buries it on the refund record,
    where nobody will ever aggregate it.

    `reason_code` is a fixed vocabulary (see CANCEL_REASON_CODES in
    services/cancellations.py) precisely so it IS aggregatable; free text alone
    produces a thousand unique strings and answers nothing.
    """
    __tablename__ = "instant_cancellations"

    id: Mapped[uuid.UUID] = uuid_pk()
    job_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(40), nullable=False)
    reason_text: Mapped[str | None] = mapped_column(Text)

    # Snapshotted so the signal survives the job changing or being deleted.
    category_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    service_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("services.id"))
    quoted_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))

    # The most useful number here: a cluster of cancels at ~30s means dispatch
    # is too slow, not that the price is wrong.
    seconds_searching: Mapped[int | None] = mapped_column(Integer)
    workers_notified: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()


# ── 45. PENALTY DUES (worker debt ledger) ─────────────────────
class PenaltyDue(Base):
    """
    Money a worker owes for cancelling a job they had already accepted,
    carried forward and settled out of their next payout.

    KEYED ON PHONE **AND** EMAIL, not just worker_id. A debt attached only to a
    worker_id evaporates the moment someone deletes their profile and signs up
    again — which is exactly the behaviour a penalty system must not have.
    `worker_id`/`user_id` are kept for joins and are ON DELETE SET NULL; the
    contact columns are the durable identity that survives the account.

    A LEDGER (one row per debt) rather than a balance column on
    worker_profiles: a balance says what is owed, a ledger says *why*. Disputes
    about money are guaranteed, and "your balance is ₹250" is not an answer.
    """
    __tablename__ = "penalty_dues"

    id: Mapped[uuid.UUID] = uuid_pk()
    worker_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("worker_profiles.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

    job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|settled|waived

    settled_against_job_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    waived_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    waived_reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = now()


# ── 46. SERVICE SECTIONS (customer-facing browse shelves) ─────
class ServiceSection(Base):
    """
    A cross-profession browsing shelf on Discovery: "Fan", "Beauty", "Salon".

    NOT a Category. Category = the profession a worker is verified for; it
    drives dispatch, approval and who may offer what. A Section is purely
    presentational and cuts ACROSS professions — "Fan" pulls fan installation
    (Electrician) and fan cleaning (Cleaner) onto one row, because a customer
    thinking "my fan is broken" doesn't think in professions.

    Kept structurally separate on purpose: making sections a second kind of
    category would drag a cosmetic grouping into the dispatch path.
    """
    __tablename__ = "service_sections"

    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    icon_url: Mapped[str | None] = mapped_column(Text)
    icon_emoji: Mapped[str | None] = mapped_column(String(16))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = now()
    updated_at: Mapped[datetime] = now()


class ServiceSectionItem(Base):
    """
    Many-to-many: which SYSTEM services (service_catalog) sit in which section.

    Many-to-many rather than a `section_id` column on service_catalog because a
    service can legitimately belong to more than one shelf — "deep clean" is
    both "Cleaning" and "Home". A single column would force a false choice and
    guarantee a migration later.

    Keyed on service_catalog, never on `services`: only admin-curated system
    services appear in these shelves.
    """
    __tablename__ = "service_section_items"

    section_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("service_sections.id", ondelete="CASCADE"), primary_key=True
    )
    catalog_service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("service_catalog.id", ondelete="CASCADE"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = now()
