from typing import Optional, List, Any, Dict
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, Field
from enum import Enum

# --- Enums (Matched to SQL) ---
class WorkerType(str, Enum):
    individual = 'individual'
    freelancer = 'freelancer'
    part_time = 'part_time'
    company = 'company'
    agency = 'agency'

class WorkerTier(str, Enum):
    general = 'general'
    professional = 'professional'

class JobStatus(str, Enum):
    draft = 'draft'
    open = 'open'
    bidding = 'bidding'
    assigned = 'assigned'
    pending_acceptance = 'pending_acceptance'
    in_progress = 'in_progress'
    completed = 'completed'
    cancelled = 'cancelled'
    disputed = 'disputed'
    requested = 'requested'

class ComplaintStatus(str, Enum):
    pending = 'pending'
    investigating = 'investigating'
    resolved_refunded = 'resolved_refunded'
    resolved_dismissed = 'resolved_dismissed'
    resolved_banned = 'resolved_banned'

class KycStatus(str, Enum):
    none = 'none'
    pending = 'pending'
    verified = 'verified'
    rejected = 'rejected'

class Gender(str, Enum):
    male = 'male'
    female = 'female'
    other = 'other'

# --- User & Profile ---
class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    address_text: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    gender: Optional[Gender] = None
    dob: Optional[date] = None

class WorkerProfileUpdate(BaseModel):
    worker_type: Optional[WorkerType] = None
    tier: Optional[WorkerTier] = None
    professions: Optional[List[str]] = None
    services: Optional[List[str]] = None
    skills: Optional[List[str]] = None
    min_hourly_rate_cents: Optional[int] = None
    max_hourly_rate_cents: Optional[int] = None
    experience_years: Optional[int] = None
    about_text: Optional[str] = None
    search_radius_meters: Optional[int] = None
    accepts_remote: Optional[bool] = None
    accepts_auto_assign: Optional[bool] = None
    accepts_direct_hire: Optional[bool] = None
    is_online: Optional[bool] = None

class LocationUpdate(BaseModel):
    lat: float
    lon: float

# --- Jobs ---
class JobCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    profession_required: Optional[str] = None
    services_required: Optional[List[str]] = None
    is_remote: bool = False
    lat: Optional[float] = None
    lon: Optional[float] = None
    budget_min_cents: Optional[int] = None
    budget_max_cents: Optional[int] = None
    price_type: str = "fixed"
    address_text: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None

class JobStatusUpdate(BaseModel):
    status: str # Strict Enum

class BookJobDetails(JobCreate):
    pass

class BookJobRequest(BaseModel):
    worker_id: UUID
    job_details: BookJobDetails

class BidCreate(BaseModel):
    amount_cents: int
    message: Optional[str] = None

class HireRequest(BaseModel):
    job_id: UUID
    bid_id: UUID

class JobProofSubmit(BaseModel):
    worker_comment: Optional[str] = None
    worker_proof_imgs: List[str] = [] 
    bill_details: List[Dict[str, Any]] = []

class JobProofApprove(BaseModel):
    customer_comment: Optional[str] = None
    rating: int = Field(..., ge=1, le=5)

# --- Governance & Ratings ---
class RatingCreate(BaseModel):
    job_id: UUID
    target_id: UUID
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None

class ComplaintCreate(BaseModel):
    target_user_id: Optional[UUID] = None
    job_id: Optional[UUID] = None
    complaint_type: str
    severity_level: int = 1
    subject: str
    description: Optional[str] = None
    evidence_files: Optional[List[str]] = None

# --- KYC ---
class KycDocCreate(BaseModel):
    doc_type: str
    doc_subtype: Optional[str] = None
    storage_path: str
    doc_number: Optional[str] = None

# --- Admin ---
class AdminKycReview(BaseModel):
    status: KycStatus
    reason: Optional[str] = None

class AdminComplaintUpdate(BaseModel):
    status: ComplaintStatus
    resolution_notes: Optional[str] = None

class AdminFlagUpdate(BaseModel):
    is_flagged: bool
    reason: Optional[str] = None

# --- Misc ---
class PushTokenCreate(BaseModel):
    token: str
    device_type: Optional[str] = None

class MessageCreate(BaseModel):
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None