"""
Kaargar — All Pydantic schemas (request/response models).
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, EmailStr, ConfigDict, computed_field
from typing import Optional


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


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None


# ── CATEGORIES ────────────────────────────────────────────────
class CategoryResponse(KaargarBase):
    id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    icon_name: Optional[str] = None
    color_hex: Optional[str] = None
    mode: str
    is_active: bool
    is_featured: bool
    sort_order: int
    parent_id: Optional[UUID] = None
    min_price: Decimal


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

# FIXED: Aliases added to match frontend UI payload
class WorkerProfileUpdate(BaseModel):
    bio: Optional[str] = None
    experience_years: Optional[int] = Field(default=None, alias="years_experience")
    pune_area: Optional[str] = Field(default=None, alias="area")
    service_radius_km: Optional[int] = None
    is_instant_available: Optional[bool] = Field(default=None, alias="instant_available")
    is_discovery_available: Optional[bool] = None
    min_rate: Optional[Decimal] = None
    max_rate: Optional[Decimal] = None
    
    model_config = ConfigDict(populate_by_name=True)


class WorkerProfileResponse(KaargarBase):
    id: UUID
    user_id: UUID
    bio: Optional[str] = None
    experience_years: int
    pune_area: Optional[str] = None
    status: str
    verification_status: str
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
    created_at: datetime


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
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None


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
    price_type: str = "hourly"
    duration_min: Optional[int] = None
    
    model_config = ConfigDict(populate_by_name=True)


class ServiceUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = Field(default=None, alias="hourly_rate")  
    price_type: Optional[str] = None
    duration_min: Optional[int] = None
    is_active: Optional[bool] = None
    
    model_config = ConfigDict(populate_by_name=True)


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
    total_bookings: int
    avg_rating: Decimal
    rating_count: int
    created_at: datetime
    
    @computed_field
    @property
    def hourly_rate(self) -> Decimal:
        return self.price

# ── PACKAGES ──────────────────────────────────────────────────
class PackageCreate(BaseModel):
    title: str
    description: Optional[str] = None
    original_price: Decimal
    discounted_price: Decimal
    service_ids: list[UUID] = []


class PackageResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    title: str
    description: Optional[str] = None
    original_price: Decimal
    discounted_price: Decimal
    is_active: bool
    total_bookings: int
    created_at: datetime


# ── OFFERS ────────────────────────────────────────────────────
class OfferCreate(BaseModel):
    service_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    discount_type: str
    discount_value: Decimal
    min_order_value: Optional[Decimal] = None
    promo_code: Optional[str] = None
    valid_until: datetime


class OfferResponse(KaargarBase):
    id: UUID
    worker_id: UUID
    title: str
    discount_type: str
    discount_value: Decimal
    promo_code: Optional[str] = None
    valid_until: datetime
    is_active: bool
    usage_count: int


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
    category_id: UUID
    job_type: str
    status: str
    title: Optional[str] = None
    description: Optional[str] = None
    location_lat: Decimal
    location_lon: Decimal
    location_address: str
    location_area: Optional[str] = None
    quoted_price: Optional[Decimal] = None
    final_price: Optional[Decimal] = None
    platform_fee: Optional[Decimal] = None
    worker_payout: Optional[Decimal] = None
    workers_notified: int
    dispatch_rounds: int
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    created_at: datetime


class JobCancel(BaseModel):
    reason: str


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

class SearchResponseWrapper(BaseModel):
    results: list[SearchResult]


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


# ── ADMIN ─────────────────────────────────────────────────────
class AdminDashboard(BaseModel):
    active_jobs: int
    online_workers: int
    today_revenue: Decimal
    fill_rate: float
    searching_jobs: int


class AdminWorkerAction(BaseModel):
    reason: Optional[str] = None


class AdminConfigUpdate(BaseModel):
    key: str
    value: str


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
