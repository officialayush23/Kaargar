from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_env: str = Field("development", alias="ENVIRONMENT")
    app_name: str = "Kaargar"
    frontend_url: str = "http://localhost:5173"
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
    smtp_host: str = Field("smtp.gmail.com", alias="SMTP_HOST")
    smtp_port: int = Field(587, alias="SMTP_PORT")
    smtp_username: str = Field("", alias="SMTP_USERNAME")
    smtp_password: str = Field("", alias="SMTP_PASSWORD")
    smtp_from_email: str = Field("noreply@kaargar.in", alias="SMTP_FROM_EMAIL")
    smtp_from_name: str = "Kaargar"

    # Mapbox
    mapbox_access_token: str = Field("", alias="MAP_BOX_API_KEY")

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "populate_by_name": True,
        "extra": "ignore",
    }


@lru_cache()
def get_settings() -> Settings:
    return Settings()
