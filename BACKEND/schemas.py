"""
Kaargar — All Pydantic schemas (request/response models).
"""

from datetime import datetime, date, time
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, EmailStr, ConfigDict, computed_field, field_validator
from typing import Optional, List


# ── BASE ──────────────────────────────────────────────────────
class KaargarBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ── AUTH ──────────────────────────────────────────────────────
class OTPSendRequest(BaseModel):
    email: EmailStr


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: "UserResponse"


class RefreshRequest(BaseModel):
    refresh_token: str


# ── USERS ─────────────────────────────────────────────────────
class UserResponse(KaargarBase):
    id: UUID
    email: str
    email_verified: bool
    phone: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str
    referral_code: Optional[str] = None
    created_at: datetime
    # UI preferences, carried on the user payload rather than needing a second
    # request. The client already fetches this on every launch (GET /auth/me),
    # so language arrives with the account and cannot be inherited from
    # whoever used the phone last. Defaults keep older clients working.
    language: str = "en"
    active_mode: str = "customer"


class UserUpdate(BaseModel):
    """
    Client-editable profile fields — validated, because PATCH /users/me used
    to accept any string: a 10 KB "name", a phone of "lol", or an avatar_url
    pointing at any host (rendered in the admin panel and other users' apps).
    """
    full_name: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = None
    avatar_url: Optional[str] = Field(None, max_length=1000)

    @field_validator("full_name")
    @classmethod
    def _name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = " ".join(v.split())
        if not (1 <= len(v) <= 100):
            raise ValueError("Name must be 1-100 characters")
        if any(ord(c) < 32 for c in v):
            raise ValueError("Name contains invalid characters")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        import re
        digits = re.sub(r"[^\d+]", "", v)
        if not re.fullmatch(r"\+91[6-9]\d{9}", digits):
            raise ValueError("Enter a valid Indian mobile number")
        return digits

    @field_validator("avatar_url")
    @classmethod
    def _avatar(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        from config import get_settings
        base = get_settings().supabase_url.rstrip("/") + "/storage/v1/object/"
        if not v.startswith(base):
            raise ValueError("Avatar must be uploaded through /upload/profile-photo")
        return v


# ── CATEGORIES ────────────────────────────────────────────────
class CategoryResponse(KaargarBase):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    icon_name: Optional[str] = None
    icon_emoji: Optional[str] = None
    icon_url: Optional[str] = None   # custom PNG/SVG/Lottie from Supabase Storage
    color_hex: Optional[str] = None
    mode: str
    gst_treatment: str = "commission_only"
    is_active: bool
    is_featured: bool
    sort_order: int
    parent_id: Optional[UUID] = None
    min_price: Decimal


class CategoryCreate(BaseModel):
    name: str
    slug: str
    description: Optional[str] = None
    icon_name: Optional[str] = None
    icon_emoji: Optional[str] = None
    icon_url: Optional[str] = None
    # Must be a real hex color ("#RRGGBB") — the categories.color_hex DB
    # column is VARCHAR(7). A CSS variable string like 'var(--text-muted)'
    # used to be the frontend's default form value here, which is 18
    # characters and blew through this limit with a raw
    # StringDataRightTruncationError 500 on every category save that didn't
    # touch the color picker. max_length turns that into a clean 422
    # instead, regardless of which client sends the bad value.
    color_hex: Optional[str] = Field(default='#6B7280', max_length=7)
    mode: str = 'instant'          # instant | discovery | both
    gst_treatment: str = 'commission_only'  # platform_liable_full | commission_only | exempt
    is_featured: bool = False
    sort_order: int = 99
    min_price: Decimal = Decimal('150')


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    icon_name: Optional[str] = None
    icon_emoji: Optional[str] = None
    icon_url: Optional[str] = None
    color_hex: Optional[str] = None
    mode: Optional[str] = None
    gst_treatment: Optional[str] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    sort_order: Optional[int] = None
    min_price: Optional[Decimal] = None

# ── PUNE AREAS ────────────────────────────────────────────────
class PuneAreaResponse(KaargarBase):
    id: UUID
    name: str
    lat: Decimal
    lon: Decimal


# ── WORKER PROFILES ───────────────────────────────────────────
class WorkerProfileCreate(BaseModel):
    bio: Optional[str] = None
    experience_years: int = 0
    pune_area: Optional[str] = None
    service_radius_km: int = 5
    category_ids: list[UUID] = []
    allow_multi_day_booking: bool = False

# FIXED: Aliases added to match frontend UI payload
class WorkerProfileUpdate(BaseModel):
    full_name: Optional[str] = None          # updates users.full_name
    bio: Optional[str] = None
    experience_years: Optional[int] = Field(default=None, alias="years_experience")
    pune_area: Optional[str] = Field(default=None, alias="area")
    service_radius_km: Optional[int] = None
    is_instant_available: Optional[bool] = Field(default=None, alias="instant_available")
    is_discovery_available: Optional[bool] = None
    min_rate: Optional[Decimal] = None
    max_rate: Optional[Decimal] = None
    allow_multi_day_booking: Optional[bool] = None

    model_config = ConfigDict(populate_by_name=True)


class WorkerProfileResponse(KaargarBase):
    id: UUID
    user_id: UUID
    bio: Optional[str] = None
    experience_years: int
    pune_area: Optional[str] = None
    status: str
    verification_status: str
    rejection_reason: Optional[str] = None
    is_instant_available: bool
    is_discovery_available: bool
    service_radius_km: int
    avg_rating: Decimal
    rating_count: int
    total_jobs_completed: int
    acceptance_rate: Decimal
    completion_rate: Decimal
    cancellation_score: Decimal
    total_earnings: Decimal
    min_rate: Optional[Decimal] = None
    max_rate: Optional[Decimal] = None
    allow_multi_day_booking: bool = False
    created_at: datetime
    # Structured, multi-valued list of named Pune areas this worker serves
    # (migration 017) — Instant dispatch is filtered strictly to these.
    # Distinct from pune_area above (a single free-text display field).
    area_ids: list[UUID] = []


class WorkerAreaSet(BaseModel):
    """Full-replacement set of named Pune areas a worker serves — used for
    Instant-mode dispatch filtering (services/matching.py). An empty list is
    valid and means the worker gets zero Instant jobs until they pick some."""
    area_ids: list[UUID] = []


class WorkerPublicResponse(KaargarBase):
    id: UUID
    user_id: UUID
    bio: Optional[str] = None
    experience_years: int
    pune_area: Optional[str] = None
    avg_rating: Decimal
    rating_count: int
    total_jobs_completed: int
    min_rate: Optional[Decimal] = None
    max_rate: Optional[Decimal] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    # Additional public fields for WorkerProfilePage
    status: str = "offline"
    verification_status: str = "pending"
    service_mode: Optional[str] = None
    is_instant_available: bool = False
    is_discovery_available: bool = False
    quality_rating: Optional[Decimal] = None
    punctuality_rating: Optional[Decimal] = None
    communication_rating: Optional[Decimal] = None
    value_rating: Optional[Decimal] = None
    allow_multi_day_booking: bool = False
    # Service-area map on the public profile. The CENTROID of the worker's
    # named home area (pune_areas), never their live or home position — a
    # public page must not reveal where someone actually is.
    area_lat: Optional[float] = None
    area_lon: Optional[float] = None
    service_radius_km: Optional[int] = None


class WorkerStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(online|offline)$")


class WorkerLocationUpdate(BaseModel):
    lat: float
    lon: float
    accuracy_m: Optional[float] = None
    heading: Optional[float] = None


# ── WORKER DOCUMENTS ──────────────────────────────────────────
class WorkerDocumentResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    type: str
    cloudinary_url: str
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime


class DocumentUpload(BaseModel):
    type: str
    cloudinary_url: str
    cloudinary_id: str
    file_size_kb: Optional[int] = None



# ── SERVICES ──────────────────────────────────────────────────
class ServiceCreate(BaseModel):
    category_id: Optional[UUID] = None
    title: str = Field(..., max_length=150)
    description: Optional[str] = None
    price: Decimal = Field(default=Decimal("0.0"), alias="hourly_rate")
    price_type: str = "fixed"
    duration_min: Optional[int] = None
    service_mode: str = Field(default="both", pattern="^(walkin|onsite|both)$")
    visit_fee: Optional[Decimal] = None
    # Slot-based scheduling
    requires_slot: bool = False
    slot_duration_min: Optional[int] = Field(default=None, ge=15, le=480)
    max_slots_per_day: Optional[int] = Field(default=None, ge=1, le=50)
    allow_multi_day_booking: bool = False
    # Links this listing to an admin-curated catalog entry (migration 013).
    # Set this to make the service selectable in Instant-mode browsing —
    # omit it for a plain free-text Discover-only listing.
    catalog_service_id: Optional[UUID] = None

    model_config = ConfigDict(populate_by_name=True)


class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, alias="hourly_rate")
    price_type: Optional[str] = None
    duration_min: Optional[int] = None
    is_active: Optional[bool] = None
    service_mode: Optional[str] = Field(default=None, pattern="^(walkin|onsite|both)$")
    visit_fee: Optional[Decimal] = None
    requires_slot: Optional[bool] = None
    slot_duration_min: Optional[int] = Field(default=None, ge=15, le=480)
    max_slots_per_day: Optional[int] = Field(default=None, ge=1, le=50)
    allow_multi_day_booking: Optional[bool] = None
    catalog_service_id: Optional[UUID] = None

    model_config = ConfigDict(populate_by_name=True)


# ── TAGS ──────────────────────────────────────────────────────
class TagResponse(KaargarBase):
    id: UUID
    name: str
    slug: str
    usage_count: int


class TagCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)


class ServiceTagsSet(BaseModel):
    tag_ids: list[UUID] = []
    new_tag_names: list[str] = []   # names of brand-new tags to create on the fly


class ServiceResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    category_id: UUID
    title: str
    description: Optional[str] = None
    price: Decimal
    price_type: str
    duration_min: Optional[int] = None
    is_active: bool
    service_mode: str
    visit_fee: Optional[Decimal] = None
    total_bookings: int
    avg_rating: Decimal
    rating_count: int
    requires_slot: bool = False
    slot_duration_min: Optional[int] = None
    max_slots_per_day: Optional[int] = None
    allow_multi_day_booking: bool = False
    catalog_service_id: Optional[UUID] = None
    tags: list[TagResponse] = []


# ── SERVICE CATALOG (admin-curated, migration 013) ─────────────
class ServiceCatalogResponse(KaargarBase):
    id: UUID
    category_id: UUID
    name: str
    description: Optional[str] = None
    icon_url: Optional[str] = None
    # Admin-set price floor/reference for this specific service (migration
    # 014) — always the raw DB value, shown to workers picking this service
    # so they know the minimum they can charge.
    base_price: Optional[Decimal] = None
    status: str
    submitted_by_worker_id: Optional[UUID] = None
    rejection_reason: Optional[str] = None
    sort_order: int
    is_active: bool
    total_bookings: int
    created_at: datetime
    # Populated only where useful (browse endpoints) — a representative
    # photo pulled from offering workers' ServiceMedia, and the count of
    # workers currently offering it. Not part of the DB row itself.
    photo_url: Optional[str] = None
    worker_count: Optional[int] = None
    # Customer-facing "From ₹X" — the cheapest current worker's price when
    # workers exist, falling back to base_price when nobody offers it yet
    # (see routers/categories.py). Distinct from base_price: this is a live
    # market number, base_price is the admin-set floor.
    min_price: Optional[Decimal] = None


class ServiceCatalogCreate(BaseModel):
    category_id: UUID
    name: str = Field(..., max_length=150)
    description: Optional[str] = None
    icon_url: Optional[str] = None
    base_price: Optional[Decimal] = None
    sort_order: int = 0


class ServiceCatalogUpdate(BaseModel):
    name: Optional[str] = None
    base_price: Optional[Decimal] = None
    description: Optional[str] = None
    icon_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    category_id: Optional[UUID] = None


# ── PACKAGES ──────────────────────────────────────────────────
class PackageItemCreate(BaseModel):
    service_id: UUID
    quantity: int = Field(default=1, ge=1, le=50)
    redeem_type: str = Field(default="repeatable", pattern="^(once|repeatable)$")


class PackageItemResponse(KaargarBase):
    service_id: UUID
    quantity: int
    redeem_type: str
    service: Optional[ServiceResponse] = None


class PackageCreate(BaseModel):
    title: str = Field(..., max_length=150)
    description: Optional[str] = None
    original_price: Decimal
    discounted_price: Decimal
    redemption_type: str = Field(default="multi_use", pattern="^(single_use_bundle|multi_use)$")
    validity_days: Optional[int] = Field(default=None, ge=1)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    items: list[PackageItemCreate] = []


class PackageUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    original_price: Optional[Decimal] = None
    discounted_price: Optional[Decimal] = None
    redemption_type: Optional[str] = Field(default=None, pattern="^(single_use_bundle|multi_use)$")
    validity_days: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None
    items: Optional[list[PackageItemCreate]] = None


class PackageResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    title: str
    description: Optional[str] = None
    original_price: Decimal
    discounted_price: Decimal
    redemption_type: str
    validity_days: Optional[int] = None
    is_active: bool
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    total_bookings: int
    created_at: datetime
    items: list[PackageItemResponse] = []


# ── PACKAGE ORDERS ────────────────────────────────────────────
class PackageOrderCreate(BaseModel):
    package_id: UUID


class PackageUsageResponse(KaargarBase):
    id: UUID
    service_id: UUID
    job_id: Optional[UUID] = None
    used_at: datetime


class PackageOrderResponse(KaargarBase):
    id: UUID
    user_id: UUID
    package_id: UUID
    worker_id: UUID
    status: str
    total_paid: Decimal
    expires_at: Optional[datetime] = None
    purchased_at: datetime
    package: Optional[PackageResponse] = None
    usages: list[PackageUsageResponse] = []

    @computed_field
    @property
    def days_remaining(self) -> Optional[int]:
        if self.expires_at is None:
            return None
        from datetime import timezone
        now = datetime.now(timezone.utc)
        delta = self.expires_at - now
        return max(0, delta.days)


# ── OFFERS ────────────────────────────────────────────────────
class OfferCreate(BaseModel):
    service_id: Optional[UUID] = None
    package_id: Optional[UUID] = None
    title: str = Field(..., max_length=150)
    description: Optional[str] = None
    discount_type: str = Field(..., pattern="^(percent|flat)$")
    discount_value: Decimal = Field(..., gt=0)
    min_order_value: Optional[Decimal] = None
    promo_code: Optional[str] = Field(default=None, max_length=30)
    valid_until: datetime
    usage_limit: Optional[int] = None


class OfferUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    min_order_value: Optional[Decimal] = None
    valid_until: Optional[datetime] = None
    is_active: Optional[bool] = None
    usage_limit: Optional[int] = None


class OfferResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    service_id: Optional[UUID] = None
    package_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    discount_type: str
    discount_value: Decimal
    min_order_value: Optional[Decimal] = None
    promo_code: Optional[str] = None
    valid_until: datetime
    usage_limit: Optional[int] = None
    usage_count: int
    is_active: bool
    created_at: datetime


# ── JOBS ──────────────────────────────────────────────────────
class JobCreate(BaseModel):
    category_id: UUID
    job_type: str = Field(..., pattern="^(instant|discovery)$")
    location_lat: float
    location_lon: float
    location_address: str
    location_area: Optional[str] = None
    location_note: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    service_id: Optional[UUID] = None
    # Instant-mode: the curated catalog service the customer picked (profession
    # -> service step). Drives dispatch filtering in services/matching.py.
    catalog_service_id: Optional[UUID] = None
    package_id: Optional[UUID] = None
    scheduled_at: Optional[datetime] = None
    quoted_price: Optional[Decimal] = None
    budget_max: Optional[Decimal] = None # FIXED: Required for discovery UI
    photos: Optional[list[str]] = None


class JobResponse(KaargarBase):
    id: UUID
    user_id: UUID
    worker_id: Optional[UUID] = None
    service_id: Optional[UUID] = None
    catalog_service_id: Optional[UUID] = None
    category_id: UUID
    job_type: str
    source: str = "instant"
    status: str
    title: Optional[str] = None
    description: Optional[str] = None
    location_lat: Decimal
    location_lon: Decimal
    location_address: str
    location_area: Optional[str] = None
    location_note: Optional[str] = None
    quoted_price: Optional[Decimal] = None
    final_price: Optional[Decimal] = None
    platform_fee: Optional[Decimal] = None
    worker_payout: Optional[Decimal] = None
    workers_notified: int
    dispatch_rounds: int
    # Scheduling
    slot_id: Optional[UUID] = None
    scheduled_at: Optional[datetime] = None
    preferred_days: Optional[List[str]] = None
    window_start: Optional[str] = None
    window_end: Optional[str] = None
    # Timestamps
    assigned_at: Optional[datetime] = None
    en_route_at: Optional[datetime] = None
    arrived_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    cancelled_by: Optional[str] = None
    created_at: datetime
    # Populated by the endpoint, not stored on the model
    category_name: Optional[str] = None
    # The actual SERVICE booked, not just the profession. Without this the
    # client can only show `title || category_name`, so a job with no custom
    # title renders as bare "Electrician" — the customer can't see WHAT they
    # booked while waiting for someone to accept it.
    service_title: Optional[str] = None
    worker_name: Optional[str] = None
    client_name: Optional[str] = None
    client_avatar_url: Optional[str] = None
    worker_avatar_url: Optional[str] = None
    # Populated alongside worker_name/worker_avatar_url by GET /jobs/{id} —
    # lets the frontend show a rating/job-count without a second round trip
    # to GET /workers/{id}. Same flat-field convention already used by
    # GET /jobs/frequently-booked's worker_avg_rating.
    worker_avg_rating: Optional[Decimal] = None
    worker_total_jobs_completed: Optional[int] = None
    # Job-completion-flow fields
    before_photos: Optional[List[str]] = None
    after_photos: Optional[List[str]] = None
    extra_items_total: Optional[Decimal] = None
    approved_total: Optional[Decimal] = None
    # Multi-day booking bundle
    parent_job_id: Optional[UUID] = None
    day_index: Optional[int] = None
    total_days: Optional[int] = None
    # Populated only on parent (top-level) jobs with total_days > 1 by
    # GET /jobs/me — e.g. "2/5 days done". Not stored on the model.
    bundle_status: Optional[str] = None
    # Geofencing radius (meters) the worker must be within to mark this job
    # arrived — sourced from platform_config (arrival_geofence_meters) with
    # a hardcoded fallback, same pattern as other tunables. Populated only
    # by GET /jobs/{id} so the worker's ActiveJobPage can proactively
    # disable the Arrived button before even attempting the call, instead
    # of only finding out via a 400 after tapping it. The server-side check
    # in POST /jobs/{id}/arrived is authoritative regardless — this is UX,
    # not the actual enforcement.
    arrival_geofence_m: Optional[int] = None

    # Coerce datetime.time → 'HH:MM' string for window fields
    @field_validator('window_start', 'window_end', mode='before')
    @classmethod
    def _coerce_time(cls, v):
        if v is None:
            return None
        if hasattr(v, 'strftime'):
            return v.strftime('%H:%M')
        return str(v)


class JobCancel(BaseModel):
    reason: str
    # Fixed vocabulary (services.cancellations.CANCEL_REASON_CODES) so
    # pre-assignment Instant cancellations are groupable instead of a thousand
    # unique free-text strings. Optional for backwards compatibility with the
    # web client, which doesn't send it yet — falls back to 'other'.
    reason_code: Optional[str] = None


class JobReject(BaseModel):
    """Worker declining an INSTANT dispatch.

    Reason is optional and unused, unlike JobCancel. An instant dispatch is a
    broadcast the worker never agreed to — declining it is 'no thanks', not a
    breach of anything, and demanding a reason for it is both meaningless and
    impossible from a notification action button (there's no keyboard there).
    Discovery/scheduled rejections are a different act with different rules —
    see docs/cancellation-rules.md."""
    reason: Optional[str] = None


class JobNoShowReport(BaseModel):
    """Customer reports the worker never arrived for a scheduled/discovery job."""
    notes: Optional[str] = Field(None, max_length=500)


class NoShowReportResponse(BaseModel):
    success: bool = True
    outcome: str  # 'confirmed' | 'escalated'
    message: str


class JobCustomerUnavailableFlag(BaseModel):
    """Worker flags that they arrived but the customer wasn't there/reachable."""
    notes: Optional[str] = Field(None, max_length=500)


# ── JOB COMPLETION FLOW ──────────────────────────────────────
class JobPhotoUpload(BaseModel):
    phase: str = Field(..., pattern="^(before|after)$")
    photo_url: str


class JobItemReceiptCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: Decimal = Field(..., gt=0, le=50000)
    item_photo_url: str
    receipt_photo_url: str


class JobItemReceiptResponse(KaargarBase):
    id: UUID
    job_id: UUID
    name: str
    amount: Decimal
    item_photo_url: str
    receipt_photo_url: str
    is_approved: bool
    created_at: datetime


class JobApprovalSummary(KaargarBase):
    """What the customer sees on the approval screen."""
    id: UUID
    status: str
    before_photos: List[str] = []
    after_photos: List[str] = []
    final_price: Optional[Decimal] = None
    extra_items_total: Decimal = 0
    approved_total: Optional[Decimal] = None
    items: List[JobItemReceiptResponse] = []


class JobRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=1000)


class JobOtpVerifyRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=6)


class JobCompletionCodeResponse(BaseModel):
    code: str
    expires_at: datetime


class JobContactResponse(BaseModel):
    """
    Phone delivery for the "Call" button. Masked WHEN POSSIBLE.

    Preferred path: `iv`/`ciphertext` are AES-256-GCM output (base64),
    decryptable only with the shared PHONE_CALL_CIPHER_KEY /
    VITE_PHONE_CALL_KEY / EXPO_PUBLIC_PHONE_CALL_KEY — see services/crypto.py.

    Fallback path: if that key is NOT configured, `phone` carries the plain
    number and iv/ciphertext are empty. This is a deliberate product decision
    (calling working matters more than masking in the current stage) but it IS
    a downgrade, and worth being explicit about what's lost:

      - the number appears in API responses, so it's visible in any network
        inspector and in anything that logs response bodies;
      - it can end up in server/proxy access logs.

    It does NOT change what the recipient sees — masking never hid the number
    from the dialer or call log; that needs a telephony provider. So the
    exposure is to infrastructure, not to the other party.

    Set PHONE_CALL_CIPHER_KEY (base64, exactly 32 bytes) to re-enable masking;
    no code change needed, the encrypted path resumes automatically.
    """
    name: Optional[str] = None
    iv: str = ""
    ciphertext: str = ""
    phone: Optional[str] = None


class JobWorkerLocationResponse(BaseModel):
    """Live worker position for the tracking map — customer-facing, no PII."""
    lat: float
    lon: float
    heading: Optional[float] = None
    updated_at: datetime


# ── CHAT & MESSAGES ───────────────────────────────────────────
class MessageCreate(BaseModel):
    content: str


class MessageResponse(KaargarBase):
    id: UUID
    chat_id: UUID
    sender_id: UUID
    sender_role: str
    type: str
    content: Optional[str] = None
    media_url: Optional[str] = None
    system_event: Optional[str] = None
    is_read: bool
    created_at: datetime


class ChatResponse(KaargarBase):
    id: UUID
    job_id: UUID
    user_id: UUID
    worker_id: UUID
    is_active: bool
    created_at: datetime


# ── PAYMENTS ──────────────────────────────────────────────────
class PaymentOrderCreate(BaseModel):
    job_id: UUID


class PaymentOrderResponse(BaseModel):
    razorpay_order_id: str
    amount: int  # in paise
    currency: str
    key_id: str


class PaymentVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentResponse(KaargarBase):
    id: UUID
    job_id: UUID
    amount: Decimal
    status: str
    payment_method: Optional[str] = None
    created_at: datetime


# ── REVIEWS ───────────────────────────────────────────────────
class ReviewCreate(BaseModel):
    job_id: UUID
    rating: Decimal = Field(..., ge=1, le=5)
    quality_rating: Optional[Decimal] = None
    punctuality_rating: Optional[Decimal] = None
    communication_rating: Optional[Decimal] = None
    value_rating: Optional[Decimal] = None
    text: Optional[str] = None
    photos: Optional[list[str]] = None


class ReviewResponse(KaargarBase):
    id: UUID
    job_id: UUID
    reviewer_id: UUID
    worker_id: UUID
    reviewer_name: Optional[str] = None
    rating: Decimal
    text: Optional[str] = None
    reply: Optional[str] = None
    created_at: datetime


class ReviewReply(BaseModel):
    reply: str


# ── NOTIFICATIONS ─────────────────────────────────────────────
class NotificationResponse(KaargarBase):
    id: UUID
    type: str
    title: str
    body: str
    data: dict
    is_read: bool
    created_at: datetime


# ── SUPPORT ───────────────────────────────────────────────────
class TicketCreate(BaseModel):
    type: str
    title: str
    description: str
    job_id: Optional[UUID] = None


class TicketResponse(KaargarBase):
    id: UUID
    job_id: Optional[UUID] = None
    type: str
    status: str
    priority: str
    title: str
    description: str
    resolution: Optional[str] = None
    created_at: datetime


class TicketMessageCreate(BaseModel):
    content: str


class DeviceTokenRegister(BaseModel):
    """Body for POST /notifications/device-token.

    `token` is an EXPO push token (ExponentPushToken[...]), not a raw FCM
    token — the app registers through Expo's push service, which fans out to
    FCM/APNs. Stored in DeviceToken.fcm_token, whose name predates that call.
    """
    token: str
    platform: str  # 'ios' | 'android'
    device_id: Optional[str] = None
    app_version: Optional[str] = None


class TicketResolveRequest(BaseModel):
    """Body for PATCH /support/admin/tickets/{id}/resolve — all optional.
    The admin console resolves with no payload at all, which a required body
    rejected with a 422."""
    resolution: Optional[str] = None


# ── SEARCH ────────────────────────────────────────────────────
class SearchQuery(BaseModel):
    q: str
    mode: Optional[str] = None
    category_slug: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    page: int = 1
    limit: int = 20


class SearchResult(BaseModel):
    result_type: str
    id: UUID
    name: str
    price: Optional[Decimal] = None
    avg_rating: Optional[Decimal] = None
    worker_id: Optional[UUID] = None
    worker_name: Optional[str] = None
    avatar_url: Optional[str] = None
    category_name: Optional[str] = None
    relevance_score: Optional[float] = None
    distance_km: Optional[float] = None
    photo_url: Optional[str] = None

class SearchResponseWrapper(BaseModel):
    results: list[SearchResult]
    search_history_id: str | None = None


# ── ANALYTICS ─────────────────────────────────────────────────
class WorkerAnalyticsResponse(KaargarBase):
    total_earnings: Decimal
    total_jobs: int
    month_earnings: Decimal
    month_jobs: int
    week_earnings: Decimal
    week_jobs: int
    today_earnings: Decimal
    today_jobs: int
    avg_job_value: Decimal
    # Enriched from WorkerProfile — used by dashboard cards
    avg_rating: Optional[Decimal] = None
    total_reviews: Optional[int] = None
    acceptance_rate: Optional[Decimal] = None
    jobs_offered: Optional[int] = None  # total dispatch requests resolved (accepted+rejected+expired) — 0 means no data yet, distinct from a genuine 100%/0% rate


# ── ADMIN ─────────────────────────────────────────────────────
class AdminDashboard(BaseModel):
    active_jobs: int
    online_workers: int
    today_revenue: Decimal
    fill_rate: float
    searching_jobs: int


class AdminWorkerAction(BaseModel):
    reason: Optional[str] = None
    doc_type: Optional[str] = None  # for request-reupload: specific doc type to re-request


class PayoutMarkPaid(BaseModel):
    # Manual disbursement — the admin actually sends the money themselves
    # (UPI/NEFT/bank transfer outside this app) and records the reference
    # here. There's no automated Razorpay Payouts/RazorpayX integration
    # wired up yet (that needs a separate KYC'd payouts account), so this
    # is the pragmatic v1: a human did the transfer, this just records it.
    transfer_reference: Optional[str] = None


class PayoutMarkFailed(BaseModel):
    reason: str


class AdminConfigUpdate(BaseModel):
    key: str
    value: str


class AdminConfigCreate(BaseModel):
    key: str
    value: str
    description: Optional[str] = None


# ── GENERIC ───────────────────────────────────────────────────
class Paginated(BaseModel):
    items: list
    total: int
    page: int
    pages: int


class SuccessResponse(BaseModel):
    success: bool = True
    message: str = "OK"


class MediaUploadResponse(BaseModel):
    url: str
    path: str
    bucket: str
    media_id: Optional[str] = None
    media_type: Optional[str] = None


# ── SCHEDULING ────────────────────────────────────────────────

class ScheduledJobCreate(BaseModel):
    """
    User creates a scheduled (discovery/package) job.
    preferred_days: list of ISO date strings, max 3, must be today or future.
    window_start / window_end: 'HH:MM' strings, window must be ≥ 1 hour.
    preferred_worker_id: REQUIRED — the job is always pinned to a specific
                         worker at booking time (the discovery booking flow
                         always has the customer pick a worker's profile
                         first). There is no lazy/system-assigns-later mode.
    """
    category_id: Optional[UUID] = None          # resolved from service if omitted
    service_id: Optional[UUID] = None
    package_id: Optional[UUID] = None
    package_order_id: Optional[UUID] = None
    preferred_worker_id: UUID = Field(..., description="Worker pinned at booking time — required, no lazy assignment")
    source: str = Field("scheduled", pattern="^(scheduled|package|discovery)$")
    # Location
    location_lat: float
    location_lon: float
    location_address: str
    location_area: Optional[str] = None
    location_note: Optional[str] = None
    # Scheduling
    preferred_days: List[str] = Field(..., min_length=1, max_length=3,
        description="ISO date strings e.g. ['2025-06-10','2025-06-11']")
    window_start: str = Field(..., pattern=r"^\d{2}:\d{2}$",
        description="Start of time window, 'HH:MM' e.g. '16:00'")
    window_end: str   = Field(..., pattern=r"^\d{2}:\d{2}$",
        description="End of time window, 'HH:MM' e.g. '18:00'")
    # Optional extras
    title: Optional[str] = None
    description: Optional[str] = None
    budget_max: Optional[Decimal] = None

    @field_validator("preferred_days")
    @classmethod
    def validate_days(cls, v):
        today = date.today()
        parsed = []
        for d_str in v:
            try:
                d = date.fromisoformat(d_str)
            except ValueError:
                raise ValueError(f"Invalid date format: {d_str}. Use YYYY-MM-DD.")
            if d < today:
                raise ValueError(f"preferred_days cannot be in the past: {d_str}")
            parsed.append(d_str)
        if len(set(parsed)) != len(parsed):
            raise ValueError("preferred_days must be unique.")
        return parsed

    @field_validator("window_end")
    @classmethod
    def validate_window(cls, v, info):
        start = info.data.get("window_start")
        if start:
            t_start = time.fromisoformat(start)
            t_end   = time.fromisoformat(v)
            if t_end <= t_start:
                raise ValueError("window_end must be after window_start")
            # Require at least 1-hour window
            from datetime import datetime as dt
            delta = dt.combine(date.today(), t_end) - dt.combine(date.today(), t_start)
            if delta.total_seconds() < 3600:
                raise ValueError("Time window must be at least 1 hour")
        return v


class WorkerAvailabilitySet(BaseModel):
    """Set or update availability for a single day."""
    day_of_week: int = Field(..., ge=0, le=6,
        description="0=Monday … 6=Sunday")
    start_time: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    end_time: str   = Field(..., pattern=r"^\d{2}:\d{2}$")
    is_open: bool = True

    @field_validator("end_time")
    @classmethod
    def validate_times(cls, v, info):
        start = info.data.get("start_time")
        if start and time.fromisoformat(v) <= time.fromisoformat(start):
            raise ValueError("end_time must be after start_time")
        return v


class WorkerAvailabilityResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_open: bool
    updated_at: datetime


class WorkerTimeOffCreate(BaseModel):
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str] = None

    @field_validator("end_datetime")
    @classmethod
    def validate_range(cls, v, info):
        start = info.data.get("start_datetime")
        if start and v <= start:
            raise ValueError("end_datetime must be after start_datetime")
        return v


class WorkerTimeOffResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    start_datetime: datetime
    end_datetime: datetime
    reason: Optional[str]
    created_at: datetime


class WorkerScheduleBlockResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    job_id: Optional[UUID]
    date: date
    window_start: time
    window_end: time
    created_at: datetime


class ScheduledJobReschedule(BaseModel):
    """
    Reschedule a scheduled/discovery/package job to a new time.

    Window-mode bookings (job.slot_id is None): preferred_days +
    window_start + window_end are required — the new window is validated
    against the assigned worker's real availability (or, if no worker is
    pinned yet, against whether any worker is actually open then).

    Slot-mode bookings (job.slot_id is set): target_slot_id is required
    instead — the target slot is validated for capacity/blocked state.
    """
    preferred_days: Optional[List[str]] = Field(None, min_length=1, max_length=3)
    window_start: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    window_end: Optional[str] = Field(None, pattern=r"^\d{2}:\d{2}$")
    target_slot_id: Optional[UUID] = None

    @field_validator("preferred_days")
    @classmethod
    def validate_days(cls, v):
        if v is None:
            return v
        today = date.today()
        for d_str in v:
            try:
                d = date.fromisoformat(d_str)
            except ValueError:
                raise ValueError(f"Invalid date: {d_str}")
            if d < today:
                raise ValueError(f"Date cannot be in the past: {d_str}")
        return v



class ScheduledJobResponse(KaargarBase):
    """Full job response for a scheduled (window-based or slot) booking."""
    id: UUID
    status: str
    category_id: Optional[UUID] = None
    service_id: Optional[UUID] = None
    worker_id: Optional[UUID] = None
    location_address: str
    preferred_days: Optional[List[str]] = None
    window_start: Optional[str] = None          # maps from Job.window_start (datetime.time)
    window_end: Optional[str] = None            # maps from Job.window_end   (datetime.time)
    scheduled_at: Optional[datetime] = None     # used for slot bookings
    slot_id: Optional[UUID] = None
    quoted_price: Optional[Decimal] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

    # Job.window_start / window_end are datetime.time objects — coerce to 'HH:MM'
    # before Pydantic tries to validate them as str (mode='before' runs first).
    @field_validator('window_start', 'window_end', mode='before')
    @classmethod
    def _coerce_time_to_str(cls, v):
        if v is None:
            return None
        if hasattr(v, 'strftime'):          # datetime.time object from ORM
            return v.strftime('%H:%M')
        return str(v)


class MultiDayBookingCreate(BaseModel):
    """
    Book a multi-day service (e.g. a 39-day security-guard booking) as ONE
    bundle. Replaces the old client-side pattern of calling POST
    /jobs/scheduled once per day — that produced N unrelated Job rows with no
    shared identity and no atomicity (a mid-way failure left a partial,
    inconsistent booking). This endpoint creates all N day-jobs in a single
    DB transaction: either the whole bundle is created, or none of it is.

    start_date + num_days define a contiguous run of days
    (start_date, start_date+1, ..., start_date+num_days-1) — the multi-day
    picker in BookDiscoveryPage always books a contiguous range, never
    arbitrary scattered dates.
    """
    category_id: Optional[UUID] = None
    service_id: Optional[UUID] = None
    package_id: Optional[UUID] = None
    preferred_worker_id: UUID = Field(..., description="Worker pinned at booking time — required, no lazy assignment")
    source: str = Field("discovery", pattern="^(scheduled|package|discovery)$")
    # Location
    location_lat: float
    location_lon: float
    location_address: str
    location_area: Optional[str] = None
    location_note: Optional[str] = None
    # Scheduling
    start_date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", description="First day of the booking, YYYY-MM-DD")
    # Pydantic bound is only a sanity ceiling. The REAL business limit is
    # admin-configurable via platform_config's `max_multi_day_booking_days`
    # (default 10) and is enforced in routers/jobs.py:create_multi_day_booking.
    # Keep this generous so raising the config key doesn't require a code
    # deploy — lowering it is what the config is for.
    num_days: int = Field(..., ge=1, le=30)  # hard outer bound; real cap is platform_config (default 10)
    window_start: str = Field(..., pattern=r"^\d{2}:\d{2}$")
    window_end: str   = Field(..., pattern=r"^\d{2}:\d{2}$")
    # Optional extras
    title: Optional[str] = None
    description: Optional[str] = None
    budget_max: Optional[Decimal] = None

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, v):
        try:
            d = date.fromisoformat(v)
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD.")
        # Server-side "no past dates" enforcement — independent of whatever
        # the client's date-picker already restricts (a separate bug let a
        # July-20 slot through on July 21 because that check only existed
        # client-side).
        if d < date.today():
            raise ValueError(f"start_date cannot be in the past: {v}")
        return v

    @field_validator("window_end")
    @classmethod
    def validate_window(cls, v, info):
        start = info.data.get("window_start")
        if start:
            t_start = time.fromisoformat(start)
            t_end   = time.fromisoformat(v)
            if t_end <= t_start:
                raise ValueError("window_end must be after window_start")
            from datetime import datetime as dt
            delta = dt.combine(date.today(), t_end) - dt.combine(date.today(), t_start)
            if delta.total_seconds() < 3600:
                raise ValueError("Time window must be at least 1 hour")
        return v


class JobBundleResponse(BaseModel):
    """Response for POST /jobs/scheduled/multi-day and GET /jobs/{id}/bundle —
    the parent job plus the full ordered list of day-jobs (parent included)."""
    parent_job_id: UUID
    total_days: int
    days: List[JobResponse]


# ─── Slot Scheduling Schemas ────────────────────────────────────────────────

class SlotConfigCreate(KaargarBase):
    """Create or update slot configuration for a service."""
    duration_minutes: int = Field(ge=15, le=480, default=60)
    buffer_minutes: int = Field(ge=0, le=60, default=15)
    capacity_per_slot: int = Field(ge=1, le=20, default=1)
    auto_generate_days_ahead: int = Field(ge=1, le=90, default=14)


class SlotConfigResponse(KaargarBase):
    id: UUID
    service_id: UUID
    duration_minutes: int
    buffer_minutes: int
    capacity_per_slot: int
    auto_generate_days_ahead: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ─── Device tokens (FCM push) ────────────────────────────────────────────────
# Schemas for the DeviceToken/PromoCampaign/PromoCampaignDelivery models
# (BACKEND/models.py "40"-"42") — those tables and columns already exist on
# the live DB (fcm_device_tokens_and_notification_columns /
# promo_campaigns_and_deliveries migrations) but had neither a model nor a
# schema until now. No router wires these up yet — see FCM push /
# promo-campaign work.

class DeviceTokenRegister(KaargarBase):
    """Request body for POST /users/device-tokens."""
    fcm_token: str = Field(..., min_length=1)
    platform: str = Field(..., pattern="^(ios|android)$")
    device_id: Optional[str] = None
    app_version: Optional[str] = None


class DeviceTokenResponse(KaargarBase):
    id: UUID
    user_id: UUID
    platform: str
    device_id: Optional[str] = None
    app_version: Optional[str] = None
    is_active: bool
    last_seen_at: datetime
    created_at: datetime


# ─── Promo campaigns ─────────────────────────────────────────────────────────

class PromoCampaignCreate(KaargarBase):
    """Request body for POST /admin/promo-campaigns."""
    title: str = Field(..., min_length=1, max_length=255)
    message_title: str = Field(..., min_length=1, max_length=255)
    message_body: str = Field(..., min_length=1)
    deep_link: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    promo_code: Optional[str] = None
    target_city: Optional[str] = None
    target_category_id: Optional[UUID] = None
    audience_filter: dict = Field(default_factory=dict)
    scheduled_at: Optional[datetime] = None


class PromoCampaignResponse(KaargarBase):
    id: UUID
    title: str
    message_title: str
    message_body: str
    deep_link: Optional[str] = None
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    promo_code: Optional[str] = None
    target_city: Optional[str] = None
    target_category_id: Optional[UUID] = None
    audience_filter: dict
    status: str
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    audience_count: Optional[int] = None
    success_count: int
    failure_count: int
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class PromoCampaignDeliveryResponse(KaargarBase):
    id: UUID
    campaign_id: UUID
    user_id: UUID
    device_token_id: Optional[UUID] = None
    status: str
    fcm_message_id: Optional[str] = None
    error: Optional[str] = None
    sent_at: Optional[datetime] = None
    created_at: datetime


class SlotResponse(KaargarBase):
    id: UUID
    service_id: UUID
    worker_id: UUID
    slot_date: date
    slot_start: time
    slot_end: time
    capacity: int
    booked_count: int
    is_blocked: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

    @property
    def available(self) -> bool:
        return not self.is_blocked and self.booked_count < self.capacity

    @property
    def spots_left(self) -> int:
        return max(0, self.capacity - self.booked_count)


class SlotBookingCreate(KaargarBase):
    """Request body for POST /jobs/book-slot."""
    service_id: UUID
    slot_id: UUID
    package_id: Optional[UUID] = None          # optional package to apply
    location_address: str
    location_area: Optional[str] = None
    location_note: Optional[str] = None         # renamed from 'notes'
    location_lat: float = Field(ge=-90, le=90)
    location_lon: float = Field(ge=-180, le=180)


class SlotGenerateRequest(KaargarBase):
    """Request body for POST /workers/me/services/{service_id}/slots/generate."""
    start_date: date
    end_date: date
    work_start: str = Field(default="09:00", description="HH:MM")
    work_end: str = Field(default="18:00", description="HH:MM")
    skip_days: Optional[List[str]] = Field(default=None, description="List of ISO date strings to skip")


# ─── User Saved Addresses ────────────────────────────────────────────────────

class UserAddressCreate(KaargarBase):
    label: str = Field(..., min_length=1, max_length=50)
    address_line: str = Field(..., min_length=3)
    # Flat/plot/house no., floor, landmark — free text, kept separate from
    # address_line since it's never re-derived from a geocoder.
    details: Optional[str] = None
    area: Optional[str] = None
    city: str = "Pune"
    lat: Optional[float] = None
    lon: Optional[float] = None
    place_id: Optional[str] = None
    is_default: bool = False


class UserAddressUpdate(KaargarBase):
    label: Optional[str] = Field(None, min_length=1, max_length=50)
    address_line: Optional[str] = None
    details: Optional[str] = None
    area: Optional[str] = None
    city: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    place_id: Optional[str] = None
    is_default: Optional[bool] = None


class UserAddressResponse(KaargarBase):
    id: UUID
    user_id: UUID
    label: str
    address_line: str
    details: Optional[str] = None
    area: Optional[str] = None
    city: str = "Pune"
    lat: Optional[float] = None
    lon: Optional[float] = None
    place_id: Optional[str] = None
    is_default: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

# ── WORKER ONBOARDING: ONE ATOMIC PUBLISH ─────────────────────────────────────
#
# Defined down here rather than beside WorkerProfileCreate purely for ordering:
# it references ServiceCreate (line ~239) and WorkerAvailabilitySet (~1051),
# both of which are declared after it. Subclassing at the bottom avoids
# forward-ref/model_rebuild() gymnastics.
#
# WHY IT EXISTS
# -------------
# Onboarding is ONE act from the worker's point of view — they fill in a wizard
# and press Publish. It used to be four sequential HTTP calls (profile, areas,
# each service, availability), which meant a partial success was possible, and
# a partial success is not something you can report nicely: "we saved your
# profile but not your services, please re-enter them" is a failure with extra
# steps. Accepting the whole thing in one request lets the server commit it in
# ONE transaction, so the outcome is all-or-nothing and there is nothing to
# apologise for.
#
# Every field is optional and defaults empty, so the existing web frontend's
# WorkerProfileCreate-shaped payload still validates unchanged.
class WorkerOnboardingPublish(WorkerProfileCreate):
    services: list[ServiceCreate] = []
    instant_area_ids: list[UUID] = []
    availability: list[WorkerAvailabilitySet] = []
    # Identity documents and the intro video, uploaded to Storage BEFORE the
    # profile exists (both /upload endpoints allow that deliberately) and
    # registered here, in the same transaction that creates the profile.
    #
    # They have to be registered here because a `worker_documents` row needs a
    # worker_id. `POST /upload/verification-video` tries to create one itself
    # but guards on `if wp:` — during onboarding there IS no profile yet, so it
    # silently skipped, and `POST /upload/document` never registered at all
    # (its docstring defers to "later registration via POST /workers/documents",
    # which the mobile client never called). Net effect: files sat orphaned in
    # the buckets and admin's verification queue showed "No documents uploaded
    # yet" for every worker.
    documents: list[DocumentUpload] = []
