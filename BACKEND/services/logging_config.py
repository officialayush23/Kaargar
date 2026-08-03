"""
Structured (JSON) logging + per-request correlation IDs.

Why: Render's log viewer (and any future log platform — Datadog, Better
Stack, etc.) can filter/search JSON fields directly instead of grepping
free-text lines, and every log line emitted during a request — from
main.py's middleware down through routers/services/tasks — automatically
carries the same request_id via a contextvars.ContextVar, without having to
thread a request object through every function signature.

Usage (see main.py):
    from services.logging_config import setup_logging, RequestIDMiddleware
    setup_logging(level="DEBUG" if settings.app_env != "production" else "INFO")
    app.add_middleware(RequestIDMiddleware)

Every existing `logging.getLogger(__name__)` call anywhere in the codebase
picks this up automatically — nothing else needs to change.
"""

import contextvars
import json
import logging
import sys
import uuid
from datetime import datetime, timezone

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

request_id_ctx: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

# Fields present on every plain logging.LogRecord — used to detect "extra"
# fields a caller passed via logger.info("...", extra={"foo": "bar"}) so
# they can be surfaced as real JSON fields instead of silently dropped.
_RESERVED_RECORD_FIELDS = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "message", "asctime",
}


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        for key, value in record.__dict__.items():
            if key in _RESERVED_RECORD_FIELDS or key in payload:
                continue
            try:
                json.dumps(value)
                payload[key] = value
            except TypeError:
                payload[key] = str(value)

        return json.dumps(payload, default=str)


def setup_logging(level: str = "INFO") -> None:
    """Call once, as early as possible (main.py, before routers import)."""
    root = logging.getLogger()
    root.setLevel(level)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root.addHandler(handler)

    # Quiet down noisy libraries to warnings-only so JSON log volume stays
    # sane — they still show up the moment something's actually wrong.
    for noisy_logger in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy_logger).setLevel(logging.WARNING)


def new_request_id() -> str:
    return uuid.uuid4().hex[:16]


class RequestIDMiddleware(BaseHTTPMiddleware):
    """
    Reads X-Request-ID from the incoming request if present (so a request
    can be traced across services that also set it), otherwise generates
    one. Stores it in request_id_ctx for the duration of the request —
    every log line JSONFormatter emits during that window carries it — sets
    it as a Sentry tag if Sentry is active, and echoes it back as a response
    header so the client can report it back for support/debugging.
    """

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get("x-request-id")
        request_id = incoming or new_request_id()
        token = request_id_ctx.set(request_id)
        try:
            try:
                import sentry_sdk
                sentry_sdk.set_tag("request_id", request_id)
            except ImportError:
                pass
            response = await call_next(request)
        finally:
            request_id_ctx.reset(token)
        response.headers["X-Request-ID"] = request_id
        return response
