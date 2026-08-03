from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_env: str = Field("development", alias="ENVIRONMENT")
    app_name: str = "Kaargar"
    frontend_url: str = Field("https://kaargar1.vercel.app", alias="FRONTEND_URL")
    fastapi_host: str = Field("0.0.0.0", alias="FASTAPI_HOST")
    fastapi_port: int = Field(8000, alias="FASTAPI_PORT")

    # Database — stored as postgresql:// but we need postgresql+asyncpg://
    database_url: str = Field(..., alias="DATABASE_URL")

    @field_validator("database_url", mode="before")
    @classmethod
    def fix_database_url(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    # Direct (unpooled) connection — used by Alembic only (alembic/env.py).
    # Migrations run session-level DDL/advisory-lock operations that don't
    # play well with Supavisor's transaction-mode pooler on database_url
    # above. Falls back to database_url if unset (e.g. a fresh local
    # Postgres with no pooler in front of it).
    database_url_direct: str = Field("", alias="DATABASE_URL_DIRECT")

    @field_validator("database_url_direct", mode="before")
    @classmethod
    def fix_database_url_direct(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("frontend_url", mode="before")
    @classmethod
    def normalize_frontend_url(cls, v: str) -> str:
        value = (v or "").strip().rstrip("/")
        if not value:
            return "https://kaargar1.vercel.app"
        if value.startswith(("http://", "https://")):
            return value
        return f"https://{value}"

    # Supabase
    supabase_url: str = Field(..., alias="SUPABASE_URL")
    supabase_anon_key: str = Field("", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(..., alias="SUPABASE_SERVICE_ROLE_KEY")
    supabase_jwt_secret: str = Field("", alias="SUPABASE_JWT_SECRET")

    # JWT (our own)
    jwt_secret_key: str = Field(..., alias="APP_SECRET_KEY")
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440

    # Redis (Upstash / RedisLabs)
    redis_url: str = Field("", alias="REDIS_URL")

    # Razorpay — .env uses TEST_ prefix
    razorpay_key_id: str = Field("", alias="RAZORPAY_TEST_KEY_ID")
    razorpay_key_secret: str = Field("", alias="RAZORPAY_TEST_KEY_SECRET")
    razorpay_webhook_secret: str = Field("", alias="RAZORPAY_WEBHOOK_SECRET")

    # SMTP
    resend_api_key: str = Field("", alias="RESEND_API_KEY")
    smtp_host: str = Field("smtp.gmail.com", alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_username: str = Field("", alias="SMTP_USERNAME")
    smtp_password: str = Field("", alias="SMTP_PASSWORD")
    smtp_from_email: str = Field("noreply@kaargar.in", alias="SMTP_FROM_EMAIL")
    smtp_from_name: str = "Kaargar"

    # Mapbox — the active geocoding vendor (routers/geocode.py). Migrated off
    # Google Maps/Places after it stopped working; google_maps_api_key was
    # removed from here since nothing in the backend read it anymore
    # (verified by repo-wide grep) — set GOOGLE_MAPS_API_KEY in .env to
    # nothing, it's unused now.
    mapbox_access_token: str = Field("", alias="MAP_BOX_API_KEY")

    # Groq (translation)
    groq_api_key: str = Field("", alias="GROQ_API_KEY")  # no longer used — services/translation.py migrated to Sarvam
    sarvam_api_key: str = Field("", alias="SARVAM_API_KEY")

    # Sentry (error tracking) — optional, sentry_sdk.init() is skipped entirely
    # if unset (see main.py). Currently reuses the mobile app's Sentry
    # project DSN as a stopgap — there's no dedicated backend/Python Sentry
    # project yet (create one via Sentry dashboard -> Projects -> Create
    # Project -> Python/FastAPI when there's time, then swap this value).
    sentry_dsn: str = Field("", alias="SENTRY_DSN")

    # Phone-call masking — AES-256-GCM key (base64, 32 bytes) shared with the
    # frontend's VITE_PHONE_CALL_KEY. Used only to encrypt the other party's
    # phone number in the /jobs/{id}/contact response.
    phone_call_cipher_key: str = Field("", alias="PHONE_CALL_CIPHER_KEY")

    # Dedicated worker-registration support line — shown as a persistent call
    # button on the onboarding wizard. Not hardcoded in the frontend; served
    # via GET /categories/pricing-info-style public config endpoint
    # (GET /workers/support-contact).
    worker_support_phone: str = Field("+919529419952", alias="WORKER_SUPPORT_PHONE")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "populate_by_name": True,
        "extra": "ignore",
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
