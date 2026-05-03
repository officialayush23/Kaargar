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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("categories.id"))
    min_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=50)
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

    worker = relationship("WorkerProfile", back_populates="services")
    category = relationship("Category")
    slot_config = relationship("ServiceSlotConfig", back_populates="service", uselist=False)


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

    user = relationship("User")
    worker = relationship("WorkerProfile")
    category = relationship("Category")
    service = relationship("Service")


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
